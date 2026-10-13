# SimulaAí — finalização técnica sem Stripe Live

Verificações realizadas em 13/10/2026. A configuração Stripe Live foi adiada por
solicitação do responsável; a cobrança continua em homologação e o Launch Guard
permanece ativo.

## Evidências concluídas

- CI verde e deployment Production READY para o baseline `61ee6f3`.
- Alias público correto e suporte `williamrocha6@gmail.com` publicado nas páginas legais.
- RLS ativo nas quatro tabelas de billing, sem SELECT para anon/authenticated e com SELECT para service_role.
- RPC de reserva de orçamento IA restrita ao service_role.
- Login por link mágico e logout local verificados em navegador contra produção.
- Cadastro em fixture isolada; nenhuma conta real criada por esse teste.
- Sessão expirada em fixture de navegador retorna à tela de login.
- APIs de conta, exportação e administração rejeitam requisições sem sessão.
- Exportação e analytics autenticados retornam HTTP 200 com cache privado/no-store.
- PWA verificada em navegador: manifest standalone, ícones HTTP 200, service worker ativo e shell offline.
- Security, SSRF, lint, TypeScript, audit de produção, build e E2E local passaram.
- Restore drill agora exige checksum não vazio. Testes executam o script e comprovam
  rejeição de produção, checksum ausente/vazio e arquivo corrompido antes de acesso ao banco.

## Pendências operacionais não Stripe

### IA e collector

Último snapshot autenticado: AI_PENDING=27, claims=0, fontes não saudáveis=0.
O collector está DEGRADED por backlog acima do gate fixo de 20.

Os últimos logs de extração mostram a cadeia Nemotron → Dots → Gemma com
EMPTY_BODY → TIMEOUT → 429. Os três modelos ainda constam no catálogo OpenRouter
com preço zero e suporte a response_format. Nenhuma nova geração foi executada
nesta rodada. O orçamento diário observado era de 18 reservas.

Para retomar: disponibilizar CRON_SECRET no ambiente operacional seguro,
confirmar os guards AI_ENABLED=true, FREE_AI_ONLY=true, limites 10/run e 50/day,
reconsultar catálogo e diagnóstico, executar limit=1 e parar se falhar. Somente
após sucesso de schema, semântica, evidence, claims e budget, reduzir até <=20
sem processar além do necessário. Não mudar thresholds nem mover documentos
para outro status para reduzir artificialmente a fila.

### Backup e recuperação

A consulta de backups físicos não listou backups e informou PITR desabilitado.
Isso não comprova ausência de backups externos, mas nenhum artefato externo,
checksum ou resultado de restore drill foi disponibilizado nesta execução.

Faltam SUPABASE_DB_URL, BACKUP_ENCRYPTION_KEY e RESTORE_DB_URL descartável no
ambiente seguro. Seguir `docs/backup-recovery.md`; nunca restaurar em produção.

### Advisors

Os advisors oficiais security/performance ainda precisam ser executados com
acesso à Management API/Dashboard. As consultas de RLS e RPC feitas via CLI
não substituem esses advisors. Não alterar objetos de outros sistemas.

## Status

O readiness retornou sete gates PASS; collectorBacklog e billingLiveMode FAIL.
A conclusão comercial continua bloqueada. Mesmo desconsiderando Stripe,
backlog, evidência de backup/restore real e advisors ainda impedem declarar toda
a finalização operacional concluída.

Credenciais devem ser disponibilizadas por ambiente/cofre, nunca pelo chat,
logs ou Git. Alterações posteriores exigem reconsultar readiness e verificar
CI, SHA publicado e alias.
