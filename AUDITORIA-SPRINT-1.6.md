# Sprint 1.6 — Qualidade, Fontes e Curadoria Automática

Data da validação: 30/09/2026  
Projeto Supabase autorizado: `ukwulespvvthyjqgrjfo`

## Objetivo

Aumentar a cobertura nacional sem reduzir confiabilidade, tornando registry, saúde, discovery, precedência de fontes e transições de status explicitamente governados e auditáveis.

## Implementado

- Registry maduro com `hostname`, `tier`, `adapter`, `enabled`, `source_type`, `failure_count`, `last_checked_at`, `last_success_at` e `health_status`.
- Saúde separada do último resultado operacional: `HEALTHY`, `DEGRADED`, `FAILED` e `DISABLED`.
- Falhas acima do threshold marcam `DEGRADED`, sem auto-disable.
- Desativação exige `disabled_reason`, `disabled_by` e `disabled_at`.
- Fonte nova ou reativada exige candidato `APPROVED`, revisão humana identificada e URL oficial HTTPS.
- Tier 1 restrito a autoridade factual (`ORGAO_OFICIAL`, `BANCA`, `DIARIO_OFICIAL`); Tier 2/3 permanece discovery sem poder de sobrescrever Tier 1.
- PCI e JC continuam discovery Tier 2. QConcursos e Folha Dirigida foram avaliados e registrados desativados, sem adapter revisado.
- Estados de ciclo de vida implementados: `PREVISTO`, `AUTORIZADO`, `COMISSAO_FORMADA`, `BANCA_DEFINIDA`, `EDITAL_IMEINENTE`, `EDITAL_ABERTO`, `INSCRICOES_ABERTAS`, `INSCRICOES_ENCERRADAS`, `PROVA_AGENDADA`, `EM_ANDAMENTO`, `RESULTADO`, `ENCERRADO`.
- Status só é aceito de Tier 1 com trecho literal presente no documento; regressão só é aceita em retificação, republicação ou reabertura oficial.
- Changes novos exigem fonte, tier, evidência exata e `observed_at`. Histórico antigo sem prova recuperável foi preservado como `LEGACY_UNVERIFIED` Tier 3, sem autoridade factual.
- Health endpoint passou a consumir `health_status`, em vez de inferir diretamente de `last_status`.
- Next.js atualizado de 16.3.5 para 16.3.8 após audit detectar advisory crítico novo; audit voltou a zero.

## Banco

Migrations incrementais aplicadas:

- `20260930030000_source_registry_and_curated_status.sql`
- `20260930031000_backfill_change_evidence.sql`
- `20260930032000_register_evaluated_discovery_sources.sql`

Nenhum `db reset`, `migration repair`, `DROP` ou `TRUNCATE` foi usado. A tentativa inicial do backfill retroativo falhou atomicamente ao encontrar legado sem evidência exata; a migration foi corrigida antes de ser registrada e reaplicada preservando esses registros como não confiáveis.

## Testes

- Source registry e prioridade Tier 1 > Tier 2 > Tier 3.
- Source health e threshold sem auto-disable.
- Aprovação obrigatória de candidato e rejeição de URL HTTP/inválida.
- Autoridade factual negada a agregador Tier 2.
- Normalização e transições dos 12 estados.
- Rejeição de status sem evidência literal ou originado em Tier 2.
- Precedência impedindo Tier 2 de sobrescrever Tier 1.
- PostgreSQL/PGlite: schema real, governança de ativação/desativação, sources avaliadas, trigger de evidence e atomicidade.
- Todas as regressões 1.3.1–1.5, canonical, frontend, API, segurança, SSRF, persistência, publicação, observabilidade e idempotência passaram.
- `npm run lint` passou.
- `npx tsc --noEmit` passou.
- `npm audit --omit=dev`: 0 vulnerabilidades após Next.js 16.3.8.
- `npm run build`: Next.js 16.3.8, 14 páginas/rotas, build de produção aprovado.

## Gates Remotos

Pendente de commit, push, CI, deployment e production smoke desta versão.

## Estado

Implementação, banco e validação local concluídos. A Sprint 1.6 permanece aberta até os gates remotos ficarem verdes.
