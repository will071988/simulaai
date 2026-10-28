# Auditoria final para lançamento comercial — SimulaAí

**Data da auditoria:** 27/10/2026 (evidências externas em UTC; horário da execução local conforme os registros do ambiente)
**Decisão:** **BLOQUEADO**
**Escopo:** código, CI, deployment, runtime público, readiness autenticado, Supabase autorizado, coletor, IA, parser, recuperação de senha, billing e backup/restore.
**Restrições observadas:** nenhuma cobrança, compra, reembolso, alteração financeira, retry em lote ou restore em produção foi executado.

## 1. Resumo executivo

O código auditado passou pelo CI completo e a correção de fallback para `INVALID_SCHEMA` foi publicada. O deployment de produção consultado está `READY`, o alias público responde e o endpoint autenticado de readiness retornou `14/14` gates declarativos verdadeiros. Nesta rodada, foram feitas correções locais adicionais no readiness e no webhook, mas elas **não foram publicadas**.

Isso **não é suficiente para aprovação comercial**. O `/api/health` atual retorna `{"ok":true,"status":"degraded"}` e as execuções recentes do worker `AI_PENDING` terminaram degradadas, com falhas. Além disso, a auditoria somente leitura do Stripe LIVE ficou bloqueada pela sessão deslogada, não houve compra LIVE autorizada e o tratamento de falhas, pagamentos pendentes e reembolsos não está comprovado nem completo no código. Recuperação de senha e restore completo também não têm prova end-to-end.

Portanto, o resultado correto é **BLOQUEADO**, e não “aprovado” com base apenas no endpoint de readiness.

## 2. Identidade do código e deployment

| Item | Evidência | Resultado |
|---|---|---|
| SHA auditado | `8def12742430dca15c2f06668977defef620e2e8` | PASS |
| Branch | `main`; HEAD local `3da3da3a15350b7ae6b1c6e5b20749cce2d591e1`, `origin/main` `8def12742430dca15c2f06668977defef620e2e8`; local não sincronizada | BLOCKED (publicação) |
| Correção publicada | `a6a4394` (`fix(ai): fallback after invalid schema`) e `8def127` (`test(ai): cover schema fallback budget`) | PASS |
| CI do SHA auditado | [GitHub Actions run 40518851126](https://github.com/will071988/simulaai/actions/runs/40518851126), completo e aprovado | PASS |
| Deployment | `dpl_4MeX8jFP5muZZ2E1QqM68Mbe2C7D`, target Production, estado `READY` | PASS |
| Alias | `https://simulaai-kappa.vercel.app` associado ao deployment consultado | PASS |
| SHA exposto pelo metadata do deployment | O `vercel inspect --json` coletado não expôs `gitSource`; a associação foi feita pela publicação imediatamente posterior ao SHA auditado, mas não foi independentemente confirmada por um campo de commit no metadata | BLOCKED (rastreabilidade externa) |
| Diff local atual | Oito arquivos modificados, sem push/deploy; `git diff --check` sem erro de conteúdo | PASS (revisão local) |

Rotas públicas verificadas: `/` `200`, `/api/health` `200`, `/conta/redefinir-senha` `200` e `GET /api/billing/webhook` `405`, compatível com uma rota exclusivamente POST.

## 3. Matriz dos 14 gates reais

Os nomes abaixo são os nomes implementados em `web/src/app/api/admin/release-readiness/route.ts`; não foi criada uma lista alternativa. O endpoint autenticado retornou `readyForCommercialLaunch: true`, com o snapshot: `aiPending=8`, `activeClaims=0`, `degradedSources=0`, `publishedQuestions=62`, `trustedExplanationCount=62`, `contestsWithFullExam=1`, credencial HTTP `200` e modelo `google/gemma-4-26b-a4b-it:free`.

| # | Gate real | Critério implementado / evidência atual | Readiness | Auditoria comercial |
|---:|---|---|---|---|
| 1 | `productionRuntime` | `VERCEL_ENV=production`; deployment Production `READY` | PASS | PASS |
| 2 | `collectorBacklog` | `AI_PENDING <= 20`; valor atual `8` | PASS | **BLOCKED**: o limite numérico passa, mas a saúde do worker está degradada |
| 3 | `noActiveClaims` | nenhum documento com `ai_claimed_at` ativo; valor `0` | PASS | PASS |
| 4 | `sourcesHealthy` | nenhuma fonte habilitada com health diferente de `HEALTHY`; `0` degradadas | PASS | PASS, sem substituir a verificação do worker |
| 5 | `billingConfigured` | secret de webhook, três price IDs e três Payment Links presentes na Production | PASS | **BLOCKED**: presença de configuração não prova que os recursos LIVE correspondem |
| 6 | `billingLiveMode` | `STRIPE_LIVEMODE=true` e links sem `/test_` | PASS | **BLOCKED**: Dashboard Stripe não foi reautenticado; modo, preços e links LIVE não foram confirmados nesta sessão |
| 7 | `supportConfigured` | e-mail de suporte satisfaz o formato esperado | PASS | PASS (configuração declarativa) |
| 8 | `siteUrlConfigured` | `NEXT_PUBLIC_SITE_URL` é HTTPS; host reportado `simulaai-kappa.vercel.app` | PASS | PASS |
| 9 | `freeAiGuard` | `FREE_AI_ONLY` efetivo verdadeiro | PASS | PASS (guard de configuração; não prova sozinho ausência de custo no provedor) |
| 10 | `publishedQuestionBank` | pool publicado com pelo menos 30 questões; snapshot `62` | PASS | PASS |
| 11 | `trustedExplanations` | explicações validadas com confiança/qualidade mínimas para todas as questões; `62/62` | PASS | PASS |
| 12 | `contestQuestionCoverage` | ao menos um concurso com 30 ou mais questões; snapshot `1` | PASS | PASS |
| 13 | `aiCredentialValid` | health check OpenRouter saudável, HTTP `200` | PASS | **BLOCKED**: houve `429` em runtime e fallback para Gemini; estabilidade operacional não está comprovada |
| 14 | `freeExtractionModelsAvailable` | catálogo OpenRouter aprovou os modelos configurados e a política de reasoning | PASS | **BLOCKED**: elegibilidade gratuita foi validada no catálogo, mas execução recente permaneceu degradada |

**Reconciliação:** os 14 gates são verificações de configuração, contagem e disponibilidade pontual. A versão que está em produção não consultava os jobs `AI_PENDING` ao calcular `collectorBacklog`; a correção local agora exige também `collectorHealth === "HEALTHY"`, usando a mesma regra de `/api/health`. Como essa correção ainda não foi publicada, o resultado observado em produção continua sendo o antigo `14/14`. Mesmo após publicação, o gate deverá permanecer falso enquanto os jobs reais estiverem `DEGRADED`. Os gates não exigem uma transação Stripe e não comprovam entrega de e-mail ou restore. Por isso, `14/14` não autoriza a liberação quando os critérios comportamentais permanecem sem prova.

## 4. Saúde do coletor e IA

Snapshot atual do Supabase autorizado `ukwulespvvthyjqgrjfo`:

| Métrica | Valor |
|---|---:|
| `FAILED` | 25 |
| `PROCESSED` | 42 |
| `AI_PENDING` | 8 |
| `FETCHED` | 4 |
| claims ativos | 0 |
| evidências de campos | 331 |
| reservas no dia | 41/50 |

Classificação das falhas atuais: `MAX_RETRIES=17`, `EMPTY_BODY=5`, `SCHEMA_SEMANTIC_ERROR=2` e `INSUFFICIENT_IDENTITY=1`. Não foi observado `INVALID_SCHEMA` no agrupamento atual de documentos falhos.

As fontes habilitadas verificadas — Cebraspe, FGV e PCI Concursos — estavam saudáveis; fontes desabilitadas não foram tratadas como saudáveis. As execuções recentes do job `AI_PENDING` foram `DEGRADED`, incluindo, por exemplo, execuções com `claimed=3`, `failed=2`, `processed=1`, `ai_requests=4` e com `claimed=5`, `failed=2`, `processed=3`, `ai_requests=7`.

O motivo da degradação é coerente com `web/src/lib/collector/health.ts`: qualquer job pendente `DEGRADED`, `FAILED` ou com falhas faz a saúde operacional ficar `DEGRADED`. A correção de `INVALID_SCHEMA` foi comprovada em testes sintéticos: o próximo provedor é tentado, erros não elegíveis continuam interrompendo e o orçamento físico permanece contabilizado. Isso é uma correção de mecanismo, não prova de que o worker de produção esteja saudável.

Modelo configurado: `google/gemma-4-26b-a4b-it:free`. A política `FREE_AI_ONLY`, o limite de 10 requisições por execução e o limite de 50 por dia foram preservados. Não foi iniciado novo lote após a evidência de degradação.

## 5. Parser, integridade semântica e dados canônicos

O teste `validate-role-extraction.ts` passou com cobertura de rótulos explícitos, linhas quebradas de PDF, separação de qualificação/QPBM, rejeição de texto procedimental e preservação de listas completas. A validação de extração fundamentada e os testes do conjunto `2.8` também passaram.

Registros históricos suspeitos não foram apagados nem reparados automaticamente. Qualquer correção deve ser uma proposta auditável com origem literal, valor anterior, valor proposto e justificativa, seguida de revisão autorizada. A ausência de alteração destrutiva é intencional.

## 6. Stripe LIVE e billing

### Verificação somente leitura

| Item | Estado |
|---|---|
| Variáveis Production | Presença de Stripe secret, webhook secret, três preços, três links e `STRIPE_LIVEMODE` foi confirmada sem exibir valores |
| Produto e preços LIVE | **PARTIAL PASS**; Dashboard autenticado agora mostra produto ativo e os três valores, mas a correspondência individual com variáveis Vercel não foi confirmada |
| Valores R$ 29,90/mês, R$ 299,00/ano e R$ 14,90 avulso | **BLOCKED**; IDs históricos existem no relatório anterior, mas não foram revalidados |
| Payment Links e associação a preços | **PARTIAL PASS**; três links ativos e valores exibidos, associação exata aos IDs cifrados não confirmada |
| Webhook de produção e eventos entregues | **PARTIAL PASS**; endpoint ativo, URL correta e 251 eventos exibidos; entrega/processamento individual não comprovados |
| Customer Portal | **PARTIAL PASS**; configuração acessível no Dashboard, sem ativar ou exercitar alterações |
| Compra, entitlement e revogação | **BLOCKED**; nenhuma compra LIVE foi autorizada |
| Reembolso, pagamento pendente e falha | **BLOCKED/insuficiente** |

O webhook da versão de produção auditada implementa assinatura, deduplicação por `stripe_event_id`, `checkout.session.completed` e `customer.subscription.created/updated/deleted`. Ele não possuía tratamento explícito específico para `invoice.payment_failed`, reembolso ou pagamento pendente; a correção local adicionou esses caminhos, ainda não publicados. A entidade premium consulta assinaturas `active`/`trialing` e compras `PAID`, mas essa lógica não foi comprovada por uma transação real.

**Ação necessária:** comparar em ambiente seguro os IDs cifrados da Vercel com os recursos exibidos, revisar eventos individuais e ledger Supabase somente leitura e, com autorização financeira explícita, definir eventual prova controlada. Esta auditoria não realizou pagamento.

## 7. Recuperação de senha

O código chama `resetPasswordForEmail` com retorno para `/conta/redefinir-senha` e trata erro sem revelar existência da conta. A solicitação foi aceita pelo Supabase Auth em evidência anterior.

Não foi comprovado nesta auditoria: entrega pelo SMTP, recebimento na caixa de destino, abertura do link, atualização efetiva de senha e login posterior. Portanto, o resultado é **BLOCKED**, não PASS. Nenhuma senha de usuário real foi alterada.

## 8. Backup e restore

Há evidência de backup real em 23/10/2026: artefato criptografado fora do Git, checksum SHA-256 válido, descriptografia válida e presença de `roles.sql`, `schema.sql`, `data.sql` e manifesto. A chave está protegida localmente por DPAPI.

Isso não comprova restore completo. O próprio `docs/backup-recovery.md` registra dependências do Supabase, banco compartilhado, `supabase_vault` e necessidade de alvo descartável compatível. Não foi executado restore real em ambiente isolado nesta auditoria; também não foi confirmada cópia externa do artefato e da chave. Resultado: **BLOCKED**.

Procedimento exigido antes da aprovação: obter alvo descartável, validar checksum, descriptografar, aplicar roles/schema/data, verificar tabelas de negócio, inicializar a aplicação de teste, validar autenticação/RLS/rotas críticas e preservar evidências sem tocar produção.

## 9. Correções realizadas

- `web/src/lib/ai/router.ts`: `INVALID_SCHEMA` passou a ser erro elegível para fallback.
- `web/scripts/validate-multi-provider-2.8.ts`: regressão prova tentativa do próximo provedor e interrupção para erros não elegíveis.
- `web/scripts/validate-ai-budget.ts`: expectativa de orçamento físico atualizada para duas tentativas no cenário de schema inválido.
- **Correção local não publicada:** `web/src/app/api/admin/release-readiness/route.ts` passou a incluir a saúde real do coletor e os jobs `AI_PENDING` no gate `collectorBacklog`, sem relaxar thresholds ou alterar estados.
- **Correção local não publicada:** `web/src/app/api/billing/webhook/route.ts` passou a tratar `invoice.payment_failed`, `invoice.payment_action_required`, `customer.subscription.paused/resumed` e eventos de refund; falhas tornam a assinatura inelegível e refunds tornam compras `REFUNDED` sem conceder acesso.
- **Correção local não publicada:** `web/src/lib/collector/retryPolicy.ts` e `web/src/app/api/collector/pending/route.ts` agora interpretam `Retry-After` em segundos ou data HTTP para reagendar `429`, mantendo fallback de cinco minutos quando o header é inválido. Erros de schema continuam contando tentativas e falhas permanentes continuam rejeitadas.
- **Correção local não publicada:** OpenAI foi habilitada somente como opt-in pago explícito: `FREE_AI_ONLY=false`, `AI_OPENAI_MODEL` definido e `openai` incluído em `AI_PROVIDER_ORDER`. O padrão gratuito continua bloqueando OpenAI; nenhuma chamada real foi feita.
- **Fallback pago local não publicado:** a política efetiva agora é `AI_PROVIDER_POLICY=free_only|free_then_paid`, com precedência sobre `FREE_AI_ONLY`; ausência da variável nova preserva o modo seguro legado. A cadeia gratuita termina antes da contingência OpenAI, que exige modelos explicitamente configurados, cinco slots de chave, preços por modelo e reservas atômicas persistentes. Sem limites positivos, preços ou a migração `20261028180000_openai_paid_budget.sql` aplicada, nenhuma chamada paga é permitida.
- **Limites padrão:** `OPENAI_MAX_CALLS_PER_DAY=0`, `OPENAI_MAX_SPEND_USD_PER_DAY=0` (desligado por padrão) e `OPENAI_MAX_PAID_ATTEMPTS_PER_JOB=3`. O preço não é inventado: deve ser fornecido em `OPENAI_PRICING_JSON` a partir da tabela oficial vigente.
- `web/scripts/validate-3.4.ts` ganhou regressões para os novos eventos e estados de billing.
- Commits: `a6a4394` e `8def12742430dca15c2f06668977defef620e2e8`.
- Scripts temporários de auditoria removidos após a coleta; nenhum segredo foi versionado.

## 10. Testes executados

- `npm run test:1.5` — aprovado.
- `npm run test:2.8` — aprovado, incluindo fallback multi-provedor, orçamento, extração fundamentada e parser de cargos.
- `npm run lint` — aprovado.
- `npx tsc --noEmit` — aprovado.
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilidades.
- CI completo do SHA auditado — aprovado: [run 40518851126](https://github.com/will071988/simulaai/actions/runs/40518851126).
- Rotas públicas críticas — respostas esperadas registradas acima.

### Verificações da rodada de correção

- `npm run test:2.7` — aprovado; inclui regras de health e jobs.
- `npm run test:2.8` — aprovado; inclui fallback, orçamento, grounding, parser e SSRF.
- `npm run test:3.3` — aprovado; guards de backup/restore rejeitam produção, checksum ausente e corrupção antes do acesso ao banco.
- `npm run test:3.4` — aprovado; assinatura, RLS, idempotência e novos eventos de cobrança.
- `npm run test:3.6` — aprovado; contratos do fluxo de lançamento.
- `npm run test:3.7` — aprovado; readiness exige a saúde real do coletor e os jobs pendentes.
- `npm run test:collector-observability` — aprovado; backoff numérico, data HTTP e fallback inválido de `Retry-After`.
- `npm run test:launch` — aprovado; segurança do ledger de webhook e gates de publicação.
- `npm run lint`, `npx tsc --noEmit` e `npm audit --omit=dev --audit-level=high` — aprovados.
- `npm run build` com URL Supabase local inválida — falhou na coleta de `/api/concursos`, por configuração local, sem alteração de código.
- `npm run build` com ambiente isolado e URL HTTPS do projeto autorizado — compilação, TypeScript e geração de páginas concluídos; houve aviso não fatal de `PRACTICE_CATALOG_FAILED` durante geração estática por consulta externa, que requer validação no ambiente de build.
- `npm run test:password-recovery:ui-fixture` — aprovado em servidor local isolado `127.0.0.1:3126` com Chrome local; cobriu solicitação sem e-mail, rate limit, offline, links inválidos/expirados, callback de recovery, confirmação e atualização mockada, sem rede externa. A entrega real de e-mail e alteração em conta Supabase continuam não comprovadas.
- Produção em `2026-10-27T16:07:23Z`: `GET /api/health` respondeu HTTP `200`, `{"ok":true,"status":"degraded"}`, header `X-Vercel-Id=gru1::iad1::7zhvs-1793117240035-fe02cfa0d99d`. O deployment consultado continua `dpl_4MeX8jFP5muZZ2E1QqM68Mbe2C7D`, `READY`, e não contém o código local novo.

## 11. Pendências e riscos residuais

| Severidade | Pendência / impacto | Evidência | Ação necessária | Responsável sugerido |
|---|---|---|---|---|
| Crítica | Billing LIVE parcialmente validado, mas fluxo financeiro end-to-end sem prova; risco de liberar acesso incorretamente | Dashboard confirmou recursos ativos; correspondência Vercel, eventos individuais, ledger e entitlement ainda não comprovados | Comparar IDs/configuração, revisar eventos/ledger e definir prova controlada autorizada, sem compra nesta etapa | Operações + Billing |
| Alta | Worker e `/api/health` degradados; 25 falhas e execuções AI degradadas | `/api/health` retornou `status=degraded`; jobs recentes degradados; OpenRouter `429`, Gemini com sucessos e falhas de schema | Publicar correção de `Retry-After`, obter execução estável e analisar documentos individualmente; não fazer lote | SRE + Coletor |
| Alta | Tratamento explícito de falha de invoice, pendência e reembolso não comprovado em produção | correção local cobre eventos e testes estáticos; deployment ainda anterior | Publicar somente com autorização e validar em Stripe Test/mocks, sem compra LIVE | Billing + Backend |
| Alta | Restore completo e cópia externa não comprovados | backup/decrypt/checksum comprovados; restore real não | Executar drill em alvo descartável e registrar validação | Operações/SRE |
| Média | Entrega e redefinição efetiva de senha não comprovadas | apenas solicitação aceita e código de redirect | Verificar SMTP, entrega controlada e fluxo completo sem alterar usuário real | Auth/Ops |
| Média | Associação do SHA ao deployment não aparece no metadata coletado | `vercel inspect --json` sem `gitSource` | Confirmar commit no Dashboard/API de deployment | Release |
| Média | Dados históricos suspeitos de cargos permanecem | decisão deliberada de não reparar automaticamente | Revisão auditável e migração aprovada, se necessário | Dados/Conteúdo |
| Alta | Correções locais de readiness e webhook ainda não estão no deployment | working tree local; produção continua no deployment anterior | Revisar diff, executar CI, publicar somente com autorização explícita e repetir evidências | Release + Billing |

## 12. Limitações de acesso

- A coleta inicial encontrou a sessão Stripe deslogada; em 28/10/2026 uma sessão autorizada foi autenticada e permitiu apenas verificação visual dos recursos. A API local continua sem chave Stripe.
- Não houve autorização para compra, refund, alteração de configuração financeira ou alteração de senha real.
- Não havia alvo isolado autorizado para restore completo do banco Supabase.
- O endpoint de readiness exige sessão administrativa; ele foi reproduzido com autorização existente, sem expor tokens ou cookies.
- O endpoint de readiness não mede a saúde operacional completa do worker nem substitui testes transacionais.
- A consulta Stripe por API local não pôde ser executada: `STRIPE_SECRET_KEY` não está presente no `.env.local`. A verificação visual não expôs nem comparou os valores cifrados da Vercel.
- O fixture de senha comprova o contrato da UI, não SMTP, entrega, recebimento ou alteração em conta real.

## 13. Decisão final

**BLOQUEADO para lançamento comercial.**

O sistema tem código corrigido, CI anterior aprovado e deployment pronto, mas as correções desta rodada ainda não foram publicadas. Ainda há critérios essenciais não comprovados e degradação operacional observável. A decisão só pode ser revisada após: (1) estabilização comprovada do coletor/IA; (2) revisão Stripe LIVE e prova autorizada do ciclo financeiro, sem compra nesta rodada; (3) validação real de SMTP/recuperação em conta de teste autorizada; (4) restore drill isolado com evidências; (5) confirmação independente do SHA efetivamente associado ao deployment; e (6) CI/deployment controlado das correções locais.

## 14. Prompt específico para as pendências restantes

> Revalidar o SimulaAí após autorização explícita de publicação: revisar o diff local do readiness e webhook, executar CI completo, publicar uma única vez, confirmar o SHA no deployment e repetir `/api/health` e `/api/admin/release-readiness`. Reautenticar o Stripe Dashboard somente leitura e conferir produto, preços, Payment Links, webhook, Portal e eventos LIVE sem cobrar. Disponibilizar um navegador controlado para executar o fluxo de recuperação em conta de teste autorizada, sem expor token. Disponibilizar alvo Supabase descartável e cópia autorizada para restore drill; nunca usar produção. Não executar retries em lote de IA. Manter a decisão BLOQUEADO até o worker ficar saudável, a cobrança e a recuperação serem comprovadas end-to-end e o restore isolado ser validado.

## 15. Pré-requisitos e plano de liberação segura

### 15.1 Worker de IA e coletor

| Classe | Evidência atual | Interpretação | Ação segura |
|---|---|---|---|
| `429` | Logs de 27/10 mostram OpenRouter `google/gemma-4-26b-a4b-it:free` retornando `429`; houve sucessos posteriores no Gemini | Falha transitória/de cota/disponibilidade do provedor; não é prova de schema inválido | Respeitar `Retry-After`, manter `FREE_AI_ONLY`, não aumentar limites e observar nova execução individual autorizada |
| `INVALID_SCHEMA` | Logs históricos no OpenRouter/Gemini e testes de fallback; validação Zod/grounding rejeita resposta | Falha de contrato ou saída inválida; não pode ser aceita silenciosamente | Manter prompt/schema/decoder estritos; tentar fallback elegível e registrar a rejeição |
| `MAX_RETRIES` | 17 documentos terminaram nesse estado após a política de tentativas | Estado terminal derivado, não causa primária; pode esconder causas anteriores no histórico do documento | Não zerar contador; revisar cada documento e só propor retry individual após causa corrigida |

Contabilidade observada: `AI_PENDING=8`, `FAILED=25`, `PROCESSED=42`, `FETCHED=4`, claims `0` e orçamento `41/50`. O plano de teste individual é:

1. Selecionar um único documento autorizado, preservando `id`, `content_hash`, status e `ai_retry_count` antes do teste.
2. Confirmar que o próximo `ai_next_attempt_at` está vencido e que o orçamento diário ainda permite a prova.
3. Executar uma única chamada controlada com limite de uma unidade, sem lote e sem editar registros manualmente.
4. Conferir provider/modelo efetivo, `ai_usage_logs`, reservas, status documental, evidência e `ai_retry_count`.
5. Repetir somente se a evidência mostrar uma correção concreta; caso contrário, deixar `FAILED`/`AI_PENDING` intacto.

O código local agora converte `Retry-After` numérico ou HTTP-date em atraso de fila. Os testes confirmam valores `17`, `42` e fallback de 300 segundos para header inválido. A execução real ainda não foi autorizada; o worker continua **BLOCKED**.

### 15.2 Stripe LIVE — pré-requisitos de leitura

Confirmado sem revelar valores: a Production da Vercel possui variáveis cifradas para secret Stripe, webhook secret, três preços, três Payment Links, Portal, `STRIPE_LIVEMODE`, `NEXT_PUBLIC_SITE_URL` e limites de IA. O `.env.local` não possui `STRIPE_SECRET_KEY`; a consulta API local retornou bloqueio por ausência da chave. Isso não confirma os recursos LIVE.

Para eliminar o bloqueio, é necessário:

- usuário autenticado no Dashboard da conta Stripe correta, com permissão de leitura para produtos, preços, Payment Links, webhooks, eventos, Customer Portal e modo LIVE;
- ou chave restrita de leitura, fornecida somente no ambiente seguro de auditoria, sem registrar seu valor;
- acesso aos valores atuais das variáveis Vercel por processo seguro, apenas para comparação em memória;
- IDs e URLs correspondentes a produto, R$ 29,90 mensal, R$ 299,00 anual, R$ 14,90 avulso e três links;
- endpoint de webhook, `livemode=true`, eventos habilitados e correspondência com o host de produção;
- acesso somente leitura ao ledger Supabase para conferir persistência, sem inserir, atualizar ou apagar dados.

Critério: produto, preços, links, webhook e Portal devem corresponder em LIVE; assinatura inválida deve retornar `400`; evento repetido deve ser deduplicado; falha/pagamento pendente/reembolso devem impedir entitlement indevido. Mesmo com tudo isso, sem uma prova transacional autorizada o fluxo comercial ponta a ponta continua **BLOCKED**.

### 15.3 Recuperação de senha

O fixture local Chrome está **PASS**: comprovou solicitação sem senha, aviso neutro, rate limit, offline, links inválidos/expirados, callback de recovery, confirmação e atualização mockada sem rede externa.

Para a prova real segura, faltam: conta de teste autorizada, SMTP/serviço de e-mail configurado no Supabase Auth, domínio remetente verificado, redirect `https://simulaai-kappa.vercel.app/conta/redefinir-senha` permitido e caixa de teste controlada. O procedimento deve solicitar recuperação, confirmar recebimento sem registrar o link/token, abrir o link somente no navegador controlado, alterar a senha da conta de teste e confirmar login. Resultado atual: fixture **PASS**, entrega/alteração real **BLOCKED**.

### 15.4 Restore isolado

Verificação local atual: backup existe (`4.058.272` bytes), checksum existe e confere, chave DPAPI local existe (`262` bytes). Isso comprova integridade do artefato e disponibilidade local da chave, mas não prova cópia externa nem restore.

Destino mínimo necessário: banco PostgreSQL descartável compatível com servidor 17.6, extensões e objetos gerenciados exigidos pelo Supabase, permissões para roles/schema/data, rede isolada e aplicação de teste. O destino não pode usar o project ref de produção.

Procedimento autorizado:

1. Copiar backup e chave para cofre/ambiente descartável sem incluí-los no Git.
2. Conferir SHA-256 antes da descriptografia.
3. Executar `ops/verify-backup-restore.sh` com `RESTORE_DB_URL` descartável e `ALLOW_RESTORE_TEST=true`.
4. Validar roles, schema, extensões, contagens, RLS, autenticação e rotas críticas.
5. Registrar duração, erros, contagens e evidências; descartar o destino após a revisão.

Sem destino compatível e autorização explícita, o restore permanece **BLOCKED**. Nenhuma infraestrutura foi criada nesta execução.

### 15.5 Critérios objetivos dos 14 gates

Os gates só podem ser considerados `PASS` quando o ambiente correspondente comprovar:

1. `productionRuntime`: runtime Production identificado.
2. `collectorBacklog`: até 20 pendentes **e** `collectorHealth=HEALTHY` na versão publicada.
3. `noActiveClaims`: zero claims ativos no Supabase.
4. `sourcesHealthy`: todas as fontes habilitadas saudáveis.
5. `billingConfigured`: secret, três preços e três links presentes na Production.
6. `billingLiveMode`: Dashboard/API confirma `livemode=true` e recursos LIVE.
7. `supportConfigured`: e-mail válido e operacionalmente configurado.
8. `siteUrlConfigured`: URL HTTPS corresponde ao alias de produção.
9. `freeAiGuard`: `FREE_AI_ONLY` efetivo sem fallback pago.
10. `publishedQuestionBank`: pelo menos 30 questões publicadas verificadas.
11. `trustedExplanations`: cobertura validada para todo o pool publicado.
12. `contestQuestionCoverage`: pelo menos um exame completo com 30 questões.
13. `aiCredentialValid`: health check atual e execução controlada sem degradação não explicada.
14. `freeExtractionModelsAvailable`: catálogo atual confirma preço zero, parâmetros e modelo configurado.

### 15.6 Plano de publicação e rollback — não executado

Pré-condições: revisão humana/autorização explícita, diff limpo e aprovado, CI completo do SHA candidato, migrações revisadas, backup válido, janela de publicação e observabilidade disponível. Publicar uma única vez; confirmar deployment `READY`, alias, SHA por metadata confiável e `/api/health`.

Rollback: se build, health, readiness, rotas críticas ou segurança falharem, interromper novas execuções, preservar logs e retornar o alias ao último deployment conhecido `dpl_4MeX8jFP5muZZ2E1QqM68Mbe2C7D` por procedimento autorizado da Vercel. Não executar rollback de banco nem reprocessar documentos automaticamente. Repetir a auditoria antes de qualquer nova tentativa.

## 16. Atualização de auditoria pelo navegador — 28/10/2026

A sessão autorizada do Stripe Dashboard foi autenticada no navegador e usada somente para leitura. Não foram clicados controles de ativação, criação, edição, compra, reembolso ou alteração financeira.

| Verificação | Evidência observada no Dashboard | Estado |
|---|---|---|
| Conta/contexto | Dashboard da conta `acct_1TNHB2Bi12LxCYIj`, com contexto de produção exibido para `simulaai-kappa.vercel.app` | PASS (contexto visual) |
| Produto | Catálogo mostra um produto ativo `SimulaAí Premium`, produto `prod_VVuUGI3lKpPoPi`, com `3 preços` | PASS (existência) |
| Preços | Payment Links mostram `R$ 29,90/mês`, `R$ 299,00/ano` e `R$ 14,90`, todos ativos | PASS (valores exibidos) |
| Payment Links | Três links ativos identificados no Dashboard: `plink_1UUspeBi12LxCYIje1HUf27S`, `plink_1UUst8Bi12LxCYIjUpGnzTvX` e `plink_1UUspeBi12LxCYIjHrSmaYP2` | PASS (existência/estado) |
| Webhook | `SimulaAí Produção`, ativo, URL `https://simulaai-kappa.vercel.app/api/billing/webhook`, `251 eventos` e destino `Sua conta`; endpoint `we_1UV8NwBi12LxCYIjvO9FX8mh` | PASS (existência/URL/estado) |
| Customer Portal | Página de configuração acessível; opções de faturas, dados, pagamentos e cancelamento visíveis | PASS (configuração visível); não foi ativado nem exercitado |
| Correspondência com Vercel | Valores das variáveis cifradas não foram exibidos nem comparados em memória; detalhes individuais de alguns recursos não renderizaram conteúdo no Dashboard | BLOCKED |
| Eventos e entitlement | A contagem de eventos não prova entrega, assinatura válida, persistência Supabase ou autorização premium | BLOCKED |

Essa coleta reduz o bloqueio de existência/configuração declarativa do Stripe, mas não aprova os gates `billingConfigured`/`billingLiveMode` para lançamento: ainda falta demonstrar a correspondência exata com a Vercel, assinatura/processamento, persistência, concessão e revogação. Nenhum evento foi disparado artificialmente.

O `/api/health` também foi aberto no navegador em `https://simulaai-kappa.vercel.app/api/health` e exibiu `{"ok":true,"status":"degraded"}`. Portanto, a saúde operacional continua bloqueando o lançamento.

### Prova controlada do worker — 28/10/2026

Foi executada uma única prova sintética autorizada em produção, sem documento real, com o modelo gratuito `google/gemma-4-26b-a4b-it:free`, fixture `synthetic-extraction`, reasoning desabilitado e orçamento da prova limitado a uma chamada. Resultado: HTTP `429`, `physicalCalls=1`, `parseSuccess=false`, `schemaSuccess=false`, `semanticSuccess=false`, `errorCode=429` e `effectiveModel=MODEL_EFFECTIVE_UNKNOWN`. O catálogo OpenRouter havia aprovado o modelo como gratuito e elegível imediatamente antes.

Após a prova, a reserva diária passou de `15` para `16/50`; o último `ai_usage_log` registrou OpenRouter/Gemma, `success=false`, `error_code=429`, em `2026-10-28T16:41:10Z`. Não houve retry, alteração de documento, publicação de questão ou mudança de claim. O bloqueio do worker está confirmado como dependência de cota/disponibilidade do OpenRouter; não há evidência para corrigir isso aumentando limites ou repetindo chamadas.

### Teste dos próximos provedores — 28/10/2026

Foram executadas duas provas sintéticas adicionais, uma por provedor, sem documento real:

| Provedor/modelo | Resultado | Classificação |
|---|---|---|
| Gemini `gemini-3.1-flash-lite` | HTTP `503`, `HTTP_5XX`, uma chamada | indisponibilidade transitória; não descartar permanentemente |
| Groq `openai/gpt-oss-120b` | HTTP `400`, `INVALID_JSON`, uma chamada | incompatibilidade de saída/contrato; manter bloqueado até correção ou nova evidência |

Após as três provas sintéticas do dia, o orçamento ficou `18/50`. Os três logs mais recentes registram exatamente Gemma `429`, Gemini `HTTP_5XX` e Groq `INVALID_JSON`. Nenhum provedor testado produziu uma extração sintética válida nesta rodada. Os provedores não foram removidos da configuração nem marcados como pagos; apenas foram classificados como indisponíveis para esta validação. Não executar novas chamadas no mesmo dia sem autorização operacional e justificativa de orçamento.
