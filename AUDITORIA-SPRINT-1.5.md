# Sprint 1.5 — Ingestão Autônoma Confiável

Data da validação: 30/09/2026
Projeto Supabase autorizado: `ukwulespvvthyjqgrjfo`

## Objetivo

Concluir o pipeline confiável de ingestão de concursos reais, com fonte oficial, evidência, resolução canonical/merged, publicação fail-closed, IA gratuita limitada, idempotência e observabilidade.

## Estado Inicial

- Alterações locais relevantes já existiam e foram preservadas.
- Banco remoto tinha migrations posteriores ao checkout local; elas foram obtidas antes de qualquer push.
- `.env.production.local` continha URL pública inválida; a URL foi corrigida sem registrar ou exibir segredos.
- Backlog inicial: `AI_PENDING=0`, 22 concursos, 31 documentos, 91 evidências e 4 changes equivalentes duplicados.
- Cebraspe falhava por redirect HTTPS→HTTP→HTTPS; AOCP retornava 403; DOU encerrava a conexão.

## Implementado

- Persistência atômica de concurso, aliases, relação documental, evidências, changes, publicação e conclusão do documento.
- Claims de IA com token/hash, retry controlado, reset para nova versão documental e reaproveitamento de extração determinística válida.
- Resolução forte por URL oficial antes de `logical_key`, evitando colisão de `concursos_edital_url_key`.
- Deduplicação e chave idempotente para changes; upsert idempotente para versões, aliases, documentos e evidências.
- Política de publicação equivalente em TypeScript/SQL e RLS pública restrita a canonical publicável.
- Origem, DNS, redirects, tipo e tamanho validados em fetches; redirect de downgrade do Cebraspe evitado pelo endpoint canônico com barra.
- Hash semântico de HTML visível, removendo scripts/estilos/metadados dinâmicos sem perder o HTML bruto auditável.
- Parser de escolaridade endurecido para não interpretar “funcionamento técnico” de banner de cookies como escolaridade.
- OpenRouter com orçamento físico atômico, timeout limitado/configurável, JSON object, limite de tokens, suporte a bloco JSON e bloqueio de modelos pagos quando `FREE_AI_ONLY=true`.
- AOCP e DOU preservados no registry, porém desabilitados após cinco falhas reais consecutivas; FCC, Cesgranrio e JC seguem desabilitados sem adapter confiável.
- CI ampliado para todas as suítes obrigatórias da Sprint 1.5, audit, lint, TypeScript e build.

## Banco

Migrations incrementais aplicadas e alinhadas local/remoto:

- `20260928150000_disable_unsupported_collector_sources.sql`
- `20260928170000_publication_and_change_idempotency.sql`
- `20260929120000_autonomous_collector.sql`
- `20260929121000_atomic_contest_document.sql`
- `20260930020000_collector_retry_recovery.sql`
- `20260930021000_retry_official_url_identity_failures.sql`
- `20260930022000_cleanup_false_factual_evidence.sql`

Nenhum `db reset`, `migration repair`, `DROP` ou `TRUNCATE` foi usado. As funções `SECURITY DEFINER` usam `search_path = public, pg_temp`, revogam `PUBLIC/anon/authenticated` e concedem somente a `service_role`.

Estado real final medido:

| Métrica | Valor |
| --- | ---: |
| Concursos | 23 |
| Canonical | 22 |
| Merged | 1 |
| Documentos | 32 |
| Documentos FGV/Cebraspe | 19 |
| Evidências | 102 |
| `AI_PENDING` | 0 |
| Possíveis duplicatas | 0 |
| Versões duplicadas | 0 |
| Aliases duplicados | 0 |
| Relações duplicadas | 0 |
| Changes equivalentes duplicados | 0 |

## Segurança

- Nenhum segredo foi impresso ou gravado no repositório.
- Service role foi obtida somente em memória via CLI autenticada.
- SSRF permanece fail-closed, inclusive em redirect e DNS.
- IA permaneceu em `AI_ENABLED=true`, `FREE_AI_ONLY=true`, `AI_PROVIDER_ORDER=openrouter`, limite 10/run e 50/dia.
- `npm audit --omit=dev`: 0 vulnerabilidades reportadas.

## Testes

Passaram localmente:

- `test:1.3.1`, `test:1.3.2`, `test:post-audit`
- `test:1.4`, `test:1.4.1`, `test:1.4.2`
- `test:canonical-contract`, `test:canonical-resolution`
- `test:api-exposure`, `test:frontend-contract`
- `test:security`, `test:ssrf`, `test:api-persistence`
- `test:1.5`, `test:publication-policy`
- `test:collector-observability`, `test:collector-idempotency`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build` (Next.js 16.3.5, 14 páginas/rotas geradas)
- `npm audit --omit=dev`
- `git diff --check` (sem erro; somente avisos de conversão LF/CRLF no Windows)

O teste PostgreSQL/PGlite confirmou duas execuções estáveis: 1 concurso, 4 aliases, 2 relações, 12 evidências, 1 change e 0 candidatos a duplicidade em ambas, além de rollback, rejeição de versão/claim obsoletos e rejeição de origem externa.

## Regressões

- Canonical/merged, contratos públicos, frontend recursivo, list/hot, lazy client, exposição API, rate limiting, SSRF e persistência foram reexecutados.
- Nenhuma regressão foi detectada pelas suítes locais.

## Métricas

Validação factual real em 8 documentos:

- Fontes: 6 FGV e 2 Cebraspe.
- Tipos: 7 HTML e 1 retificação oficial.
- Precision: **100%** (16/16 alegações com evidência Tier 1 verificável).
- Coverage: **41,38%** (12/29 fatos detectáveis com evidência registrada).
- Os dois Cebraspe permaneceram `FETCHED/MAYBE`, sem fatos inventados ou publicação.

IA real OpenRouter:

- Smoke final: 2 chamadas físicas reservadas.
- Primeira: `INVALID_JSON`.
- Segunda: sucesso sem cache, `openrouter/free`, 6,31 s, schema válido.
- Budget diário após o smoke final: 28/50; nenhum provider pago foi habilitado.

Idempotência real, mesmo conjunto de 8 documentos em duas passagens:

- Primeira passagem de normalização: 4 updated, 4 unchanged.
- Segunda passagem: 0 updated, 8 unchanged.
- Segunda passagem: 0 concursos criados/alterados, 0 conflicts, 0 AI calls.
- Totais após primeira/segunda: concursos 23/23, aliases 42/42, relações 9/9, evidências 102/102, changes 18/18.

## Commit

- Implementação validada: `4149312e4850d80583df0929fd4c01fbc117bae8` (`feat: complete reliable autonomous ingestion`).
- Autor Git alinhado à conta GitHub por endereço `noreply`, sem expor e-mail privado.
- `main` enviada para `origin` sem reescrita destrutiva de histórico remoto.

## CI

- GitHub Actions run: `36661456245`.
- Commit verificado: `4149312e4850d80583df0929fd4c01fbc117bae8`.
- Resultado: **success**, com 25 etapas aprovadas, incluindo todas as suítes obrigatórias, audit, lint, TypeScript e build.
- Evidência: <https://github.com/will071988/simulaai/actions/runs/36661456245>

## Deployment

- O primeiro auto-deployment revelou `Root Directory` incorreto (`.`) e falhou antes de executar a aplicação.
- A configuração do projeto Vercel foi corrigida para `web`, onde o app Next.js realmente reside.
- Deployment de produção: `dpl_DLS8SDALH4E3Ray36XCVnvBPXd5p`.
- Estado: **Ready**.
- URL imutável: <https://simulaai-30nf8no0q-williamrocha6-5180s-projects.vercel.app>
- Alias de produção: <https://simulaai-kappa.vercel.app>

## Production Smoke

- Chrome: home, `/dashboard`, `/quiz`, `/simulados` e `/simulados/pf-cebraspe-01` carregaram corretamente.
- HTTP: as cinco páginas responderam `200`.
- Headers de segurança confirmados: CSP presente, `X-Frame-Options: DENY` e `X-Content-Type-Options: nosniff`.
- APIs públicas: `/api/concursos` e detalhe responderam `200`; health check mínimo `/api/collector` respondeu `200` sem expor segredos.
- Execução protegida: `GET /api/collector?run=1`, `POST /api/collector`, `GET /api/collector/pending` e `POST /api/collector/pending` responderam `401` sem credencial.

## Riscos Residuais

- Coverage factual ainda é 41,38%; o comportamento é fail-closed, mas ampliar cobertura oficial é objetivo da Sprint 1.6.
- Cebraspe está acessível, porém os dois itens atuais não atingem confiança suficiente e permanecem sem publicação.
- AOCP e DOU dependem de mudança no comportamento upstream ou adapter apropriado antes de reativação.
- O tier gratuito do OpenRouter apresentou timeouts, rate limit e JSON inválido antes do sucesso; retries e orçamento impedem consumo descontrolado.

## Estado Final

Implementação, banco, validação real, CI remoto, deployment e production smoke concluídos. **SPRINT 1.5 FECHADA**.
