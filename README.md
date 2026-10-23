# SimulaAí — Simulados para Concursos com IA

Plataforma de **simulações de provas** (não é curso) para concurseiros.
Foco atual: treino com questões publicadas, nota calculada no servidor, comentários validados e acompanhamento de concursos por fontes oficiais.

## Estado do produto e lançamento

- O banco geral aceita questões publicadas sem vínculo com concurso; questões de concursos não publicáveis ou mesclados continuam excluídas.
- Home e catálogo apresentam disponibilidade real. Links antigos de trilhas demonstrativas redirecionam para o gerador; rankings e comentários fictícios não fazem parte do fluxo público.
- A home usa cache de até 60 segundos apenas de totais e disciplinas públicos, invalidado na publicação administrativa. Geração e correção continuam consultando os gates atuais, sem cache de gabaritos ou dados pessoais.
- O pacote `fundamentos-v1` contém 30 exercícios de matemática e lógica, identificados como `QUESTAO_IA`/`AI_GENERATED`, sem atribuição a banca. Os gabaritos têm verificações aritméticas/tabelas-verdade; os comentários são associados ao cache validado.
- Publicação do pacote exige administrador autenticado e percorre `DRAFT → VALIDATED → PUBLISHED` pelos gates existentes. A execução é idempotente e preserva conteúdo divergente ou rejeitado.
- O banco geral não representa prova oficial nem comprova cobertura de uma trilha de concurso.
- O pacote `macae-2024-matematica-v1` adiciona 30 exercícios inéditos de treino temático para Professor C – Matemática, vinculados ao concurso público real de Macaé. O vínculo curricular foi conferido no edital 01/2024 retificado, Anexo I, páginas 42–43. Os itens têm autoria IA, banca nula, gabaritos por cálculo exato e comentários validados; não são questões oficiais nem representam cobertura integral do edital. A publicação usa o mesmo endpoint administrativo, com a revisão explícita do pacote, e exige concurso publicável.
- Stripe permanece em homologação. O painel `/admin/release` também exige conteúdo elegível, cobertura de comentários e um concurso com prova de 30 questões antes de indicar prontidão comercial.
- A migration `20261020190000_restrict_question_answer_reads.sql` remove SELECT direto em `questoes` de anon/authenticated/PUBLIC, mantendo as APIs com service_role. Isso impede leitura antecipada de gabaritos e flags `isCorrect` fora da projeção pública.
- A migration `20261022190000_protect_shared_billing_webhook_events.sql` protege, com autorização específica do responsável, o ledger compartilhado `billing_webhook_events`: RLS ativo, sem acesso de anon/authenticated/PUBLIC e com CRUD/sequence de servidor preservados. Nenhum registro de pagamento é reescrito. Integrações de webhook devem usar service_role no backend, nunca a chave pública.
- Backlog de IA, backup/restore comprovado e homologação comercial continuam sendo verificações operacionais obrigatórias. Este README não declara o lançamento aprovado.
- Em 23/10/2026 foi criado backup lógico real criptografado usando o vínculo autenticado do CLI e PostgreSQL nativo Windows; checksum e decrypt passaram. O restore real completo em alvo compatível com Supabase continua pendente; detalhes e localização do cofre DPAPI estão em `docs/backup-recovery.md`.

### Verificações locais

No diretório `web`, execute `npm run test:launch` para verificar provas matemáticas, gates PostgreSQL, publicação idempotente e correção. `npm run test:launch:e2e` usa navegador e banco isolados; informe `BROWSER_EXECUTABLE_PATH` quando o Chrome não estiver no caminho padrão do Windows.

### Publicação autorizada e smoke

Após deploy e CI verdes, `web/scripts/release-launch-production.ts` autentica uma sessão temporária de um administrador existente, publica exclusivamente a revisão conhecida pelo endpoint `/api/admin/content/starter` e verifica geração, correção, comentários, histórico e accounting. Não cria usuários, não envia e-mails, não chama providers de IA e encerra a sessão temporária. Executar apenas com autorização de escrita em produção e credenciais já presentes no ambiente seguro, nunca pelo chat ou Git:

```powershell
# Diretório: web; shell: PowerShell. O arquivo local de credenciais não é versionado.
node --env-file=.env.local --import tsx scripts/release-launch-production.ts
```

O script cria uma tentativa real de verificação na conta do administrador. Se houver falha, interrompe sem limpar dados, claims ou filas; consultar os códigos de fase nos logs e corrigir a causa antes de repetir.

O histórico remoto contém versões antigas registradas com timestamps diferentes dos arquivos locais. Não usar `migration repair` ou reaplicar migrations antigas para publicar esta entrega. O rollout da restrição de gabaritos deve usar uma área isolada com `migration fetch --linked` e dry-run comprovando que somente a nova migration será aplicada. Não ampliar novamente os privilégios para reverter: corrigir o endpoint afetado mantendo gabaritos server-only.

### Diagnóstico de extração e reasoning

O POST manual de `/api/collector/pending?limit=1|5` e o diagnóstico `/api/collector/provider-smoke` aceitam CRON_SECRET ou sessão de administrador confirmada pelo RBAC. O GET do worker continua reservado ao cron. As respostas protegidas não devem ser cacheadas.

`scripts/diagnose-extraction-reasoning.ts` planeja até duas chamadas sintéticas pelo client real: comportamento padrão do provider e reasoning desativado quando o catálogo informa suporte. Ele aborta antes da segunda condição se houver erro de configuração/input/budget. O script não processa AI_PENDING nem persiste a extração; registra reservas/logs normais e retorna somente status, flags e contadores de tokens. Nenhum raciocínio textual é registrado. `AI_EXTRACT_REASONING_POLICY=disabled` só deve ser aplicado após validação live; não aumenta max_tokens/timeout e pula modelos de reasoning obrigatório ou sem suporte declarado à desativação.

O client OpenRouter valida a credencial uma vez por instância da execução antes de admitir geração. HTTP 401/403 interrompe sem reserva e sem retry/fallback. O readiness comercial também verifica autenticação e pricing live: presença de variável não é prova de chave válida. O diagnóstico pareado aborta no primeiro erro de configuração, input ou budget.

### Provedores de IA e configuração local

- Provedores registrados: OpenRouter, Groq, Gemini, Cerebras e OpenAI direto. Credenciais são exclusivamente server-side, sem prefixo `NEXT_PUBLIC_`.
- O `.env` da raiz é a origem local de chaves; não é carregado automaticamente pelo Next.js em `web/`. Sincronizar os valores necessários com `web/.env.local` e as variáveis protegidas do Vercel, preservando as demais configurações. Não versionar arquivos reais de credenciais.
- OpenRouter exige modelo aprovado com pricing live zero. Groq/Gemini/Cerebras exigem modelo explícito e `AI_<PROVIDER>_FREE_TIER_CONFIRMED=true`, somente após confirmação do responsável pela conta. Autenticação/catálogo HTTP 200 não comprovam gratuidade ou quota de geração.
- Nesta configuração, o responsável confirmou os planos gratuitos de Groq e Gemini; os modelos selecionados devem existir nos catálogos oficiais antes da habilitação. A ordem de fallback é controlada por `AI_PROVIDER_ORDER`; cada chamada física mantém a reserva e o log existentes. Limites permanecem 10 por execução e 50/dia.
- OpenAI direto permanece bloqueado pelo contrato FREE-ONLY, mesmo com chave válida. Créditos/assinatura ChatGPT não habilitam chamadas nesse fluxo. Cerebras permanece sem chave/configuração nesta instalação.
- `/admin/release` mostra credenciais presentes, modelos e estados de configuração (`ENABLED`, `NOT_CONFIGURED`, `BLOCKED_FREE_ONLY`, etc.). Esses estados não substituem a prova de geração e validação semântica.
- Para verificar uma extração sintética em um único provedor habilitado, um administrador pode usar `POST /api/collector/provider-smoke?provider=groq&fixture=synthetic-extraction&reasoningPolicy=provider-default` (ou `provider=gemini`). O modelo é o configurado no servidor, sem override pelo solicitante. A execução tem limite de uma geração, orçamento/log normais, não processa fila e não grava conteúdo de concurso. Provedores não habilitados retornam 409 com zero chamadas. O diagnóstico OpenRouter continua usando `model=<modelo aprovado>`.
- Validação live de 23/10/2026: Groq `openai/gpt-oss-120b` passou pelo endpoint publicado. Gemini `gemini-3.1-flash-lite` e OpenRouter `dots-studio/dots-3-note-preview:free` passaram no cliente real com o prompt `extract_concurso_v5_grounded`, que explicita tipos e omite evidências ausentes. As validações semânticas não foram relaxadas. Dots só passou com reasoning desativado; a política `disabled` foi selecionada com essa evidência, mantendo 1200 tokens e timeout existentes. O catálogo ainda listava modelos que retornaram 404 na geração: disponibilidade no catálogo não equivale a geração comprovada. Esses testes sintéticos não comprovam conclusão da fila nem prontidão comercial.
- Na execução de documentos reais, o worker interrompeu os lotes após erros de entrada/semântica, liberando claims e preservando a fila. A revisão `extract_concurso_v6_grounded` reforça que UF não deve ser inferida e trata apenas espaços/quebras de linha de PDF como formatação na comparação de citações. Palavras, acentos, pontuação e fatos continuam exigindo suporte na fonte. Testes cobrem citação equivalente com quebra de linha e rejeição de citação alterada.
- O erro Groq HTTP 400 com código exato `json_validate_failed` é classificado como `INVALID_JSON`, permitindo fallback; outros HTTP 400 continuam sendo `INVALID_INPUT`. O texto/rascunho devolvido pelo provedor não é registrado. UFs são limitadas às 27 siglas válidas; uma citação de duas letras só é aceita como evidência de UF quando aparece explicitamente como token maiúsculo na fonte, não dentro de nomes de estados. O cliente real validou o edital ALPREV por fallback para Gemini; a ordem operacional foi ajustada para Gemini → Groq → OpenRouter.

## Planejamento original de trilhas (referência histórica, não catálogo publicado)
1. Polícia Federal (1.000 vagas previstas)
2. PRF (533 vagas — Cebraspe)
3. INSS (1.500 vagas Analista)
4. Banco Central (560 vagas)
5. PC-BA / PM-BA (750 + 2.700)
6. Transpetro / Dataprev / Receita

## Planejamento original de monetização
- Grátis: 1 simulado por trilha + correção parcial
- Assinatura Trilha: R$29,90/mês
- Assinatura Total Anual: R$299/ano (foco)
- Avulso Premium: R$14,90 (funil p/ assinatura)
- Integração atual: Stripe em homologação; a ativação live depende de validação específica e autorização.

## Estrutura
- `web/` — Next.js + Tailwind (app do aluno)
- `collector/` — coletor diário: editais + provas anteriores (06h)
- `supabase/` — Postgres: concursos, questoes, simulados, tentativas, assinaturas
- `ai-prompts/` — prompts gerador de simulados + correção

## Coletor diário (resumo)
1. Scraper: Cebraspe, FGV, AOCP, Cesgranrio, PCI, JC, DOU
2. IA classifica: órgão, banca, vagas, salário, data prova
3. Baixa PDFs oficiais de provas -> extrai questões -> normaliza
4. Nunca copiar QConcursos/TEC. Só fonte oficial + questões inéditas inspiradas.

## Rodar MVP
Fase 1: 6 páginas + 10 simulados/trilha + login + paywall
Fase 2: coletor + gerador IA
Fase 3: ranking, evolução, anual + avulso
