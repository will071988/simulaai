# Auditoria final para lançamento comercial — SimulaAí

**Data da auditoria:** 27/10/2026 (evidências externas em UTC; horário da execução local conforme os registros do ambiente)
**Decisão:** **BLOQUEADO**
**Escopo:** código, CI, deployment, runtime público, readiness autenticado, Supabase autorizado, coletor, IA, parser, recuperação de senha, billing e backup/restore.
**Restrições observadas:** nenhuma cobrança, compra, reembolso, alteração financeira, retry em lote ou restore em produção foi executado.

## 1. Resumo executivo

O código auditado passou pelo CI completo e a correção de fallback para `INVALID_SCHEMA` foi publicada. O deployment de produção consultado está `READY`, o alias público responde e o endpoint autenticado de readiness retornou `14/14` gates declarativos verdadeiros.

Isso **não é suficiente para aprovação comercial**. O `/api/health` atual retorna `{"ok":true,"status":"degraded"}` e as execuções recentes do worker `AI_PENDING` terminaram degradadas, com falhas. Além disso, a auditoria somente leitura do Stripe LIVE ficou bloqueada pela sessão deslogada, não houve compra LIVE autorizada e o tratamento de falhas, pagamentos pendentes e reembolsos não está comprovado nem completo no código. Recuperação de senha e restore completo também não têm prova end-to-end.

Portanto, o resultado correto é **BLOQUEADO**, e não “aprovado” com base apenas no endpoint de readiness.

## 2. Identidade do código e deployment

| Item | Evidência | Resultado |
|---|---|---|
| SHA auditado | `8def12742430dca15c2f06668977defef620e2e8` | PASS |
| Branch | `main`, sincronizada após os commits da correção | PASS |
| Correção publicada | `a6a4394` (`fix(ai): fallback after invalid schema`) e `8def127` (`test(ai): cover schema fallback budget`) | PASS |
| CI do SHA auditado | [GitHub Actions run 40518851126](https://github.com/will071988/simulaai/actions/runs/40518851126), completo e aprovado | PASS |
| Deployment | `dpl_4MeX8jFP5muZZ2E1QqM68Mbe2C7D`, target Production, estado `READY` | PASS |
| Alias | `https://simulaai-kappa.vercel.app` associado ao deployment consultado | PASS |
| SHA exposto pelo metadata do deployment | O `vercel inspect --json` coletado não expôs `gitSource`; a associação foi feita pela publicação imediatamente posterior ao SHA auditado, mas não foi independentemente confirmada por um campo de commit no metadata | BLOCKED (rastreabilidade externa) |

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

**Reconciliação:** os 14 gates são verificações de configuração, contagem e disponibilidade pontual. Eles não consultam o estado operacional completo usado por `/api/health`, não exigem uma transação Stripe e não comprovam entrega de e-mail ou restore. Por isso, `14/14` não autoriza a liberação quando os critérios comportamentais permanecem sem prova.

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
| Produto e preços LIVE | **BLOCKED**; Dashboard Stripe estava na tela de login |
| Valores R$ 29,90/mês, R$ 299,00/ano e R$ 14,90 avulso | **BLOCKED**; IDs históricos existem no relatório anterior, mas não foram revalidados |
| Payment Links e associação a preços | **BLOCKED** |
| Webhook de produção e eventos entregues | **BLOCKED**; não houve evento LIVE observado nesta auditoria |
| Customer Portal | Configurado por URL no código, mas comportamento do portal não foi testado |
| Compra, entitlement e revogação | **BLOCKED**; nenhuma compra LIVE foi autorizada |
| Reembolso, pagamento pendente e falha | **BLOCKED/insuficiente** |

O webhook implementa assinatura, deduplicação por `stripe_event_id`, `checkout.session.completed` e `customer.subscription.created/updated/deleted`. A implementação não possui tratamento explícito específico para `invoice.payment_failed`, reembolso ou pagamento pendente. A entidade premium consulta assinaturas `active`/`trialing` e compras `PAID`, mas essa lógica não foi comprovada por uma transação real.

**Ação necessária:** reautenticar o Dashboard Stripe em sessão somente leitura e revisar produto, preços, links, webhook, Portal e eventos. Depois, com autorização financeira explícita, definir uma prova controlada; esta auditoria não realizou pagamento.

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

## 11. Pendências e riscos residuais

| Severidade | Pendência / impacto | Evidência | Ação necessária | Responsável sugerido |
|---|---|---|---|---|
| Crítica | Billing LIVE não revalidado e fluxo financeiro end-to-end sem prova; risco de liberar acesso incorretamente | Dashboard deslogado; sem compra autorizada | Auditoria Stripe somente leitura e prova financeira controlada autorizada | Operações + Billing |
| Alta | Worker e `/api/health` degradados; 25 falhas e execuções AI degradadas | `/api/health` retornou `status=degraded`; jobs recentes degradados | Diagnosticar uma amostra controlada, sem lote indiscriminado, e obter execução estável | SRE + Coletor |
| Alta | Tratamento explícito de falha de invoice, pendência e reembolso não comprovado/implementado | webhook cobre apenas checkout e subscription | Definir estados, eventos, idempotência, entitlement e testes de regressão | Billing + Backend |
| Alta | Restore completo e cópia externa não comprovados | backup/decrypt/checksum comprovados; restore real não | Executar drill em alvo descartável e registrar validação | Operações/SRE |
| Média | Entrega e redefinição efetiva de senha não comprovadas | apenas solicitação aceita e código de redirect | Verificar SMTP, entrega controlada e fluxo completo sem alterar usuário real | Auth/Ops |
| Média | Associação do SHA ao deployment não aparece no metadata coletado | `vercel inspect --json` sem `gitSource` | Confirmar commit no Dashboard/API de deployment | Release |
| Média | Dados históricos suspeitos de cargos permanecem | decisão deliberada de não reparar automaticamente | Revisão auditável e migração aprovada, se necessário | Dados/Conteúdo |

## 12. Limitações de acesso

- A sessão integrada do Stripe estava deslogada; não foi possível consultar recursos LIVE diretamente.
- Não houve autorização para compra, refund, alteração de configuração financeira ou alteração de senha real.
- Não havia alvo isolado autorizado para restore completo do banco Supabase.
- O endpoint de readiness exige sessão administrativa; ele foi reproduzido com autorização existente, sem expor tokens ou cookies.
- O endpoint de readiness não mede a saúde operacional completa do worker nem substitui testes transacionais.

## 13. Decisão final

**BLOQUEADO para lançamento comercial.**

O sistema tem código corrigido, CI aprovado, deployment pronto e readiness declarativo verde. Ainda assim, há critérios essenciais não comprovados e uma degradação operacional observável. A decisão só pode ser revisada após: (1) estabilização comprovada do coletor/IA; (2) auditoria Stripe LIVE e prova autorizada do ciclo financeiro; (3) validação end-to-end de recuperação de senha; (4) restore drill isolado com evidências; e (5) confirmação independente do SHA efetivamente associado ao deployment.
