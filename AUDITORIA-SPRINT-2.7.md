# Sprint 2.7 - Observabilidade e Alertas

Data de fechamento: 05/10/2026. **Estado: aguardando CI e production smoke.**

## Escopo

Observabilidade operacional para APIs, coletor, worker de IA, backlog, orçamento gratuito, erros de runtime/banco e alertas internos deduplicados. O health público expõe apenas disponibilidade mínima; detalhes permanecem no painel administrativo privado. Alertas externos ficaram fora do escopo por dependerem de um destino autorizado.

## Implementação

- As 18 rotas em `src/app/api` usam `observeApiRoute`, com contagem por rota, método e classe HTTP, latência média/máxima e histograma para estimativa de p95.
- A escrita de métricas ocorre com `after()` após a resposta. Somente respostas 5xx fazem avaliação imediata de alertas, evitando adicionar uma ida ao banco à latência percebida ou serializar tráfego saudável.
- `/api/health` responde somente `{ ok, status }`, usa `no-store` e retorna 503 quando a operação está indisponível.
- `onRequestError` registra evento sanitizado, sem mensagem, stack, URL de origem, token ou payload.
- Coletor e worker `AI_PENDING` registram início, fim, duração, estado, contadores e código sanitizado. A aquisição é atômica por job; execuções simultâneas são rejeitadas e jobs órfãos com mais de duas horas são encerrados como falha.
- O painel privado mostra métricas de API em 24h, erros de runtime/banco, backlog devido, jobs/crons e alertas. Pendências com `ai_next_attempt_at` nulo são tratadas como imediatamente devidas, igual ao claimant.
- Alertas cobrem coletor falho ou stale, indisponibilidade total Tier 1, backlog de IA, orçamento esgotado, taxa 5xx, erros de banco e worker pendente sem execução saudável.
- Snapshots de alerta são serializados e monotônicos. Um snapshot atrasado não resolve nem reabre estado mais novo; reabertura inicia novo incidente e incrementa a ocorrência somente na transição `RESOLVED -> OPEN`.
- Falhas de persistência de métricas, jobs, cache e uso de IA geram log estruturado sanitizado em vez de desaparecerem silenciosamente.

## Banco

A migration incremental `20261005140000_operational_observability.sql` foi aplicada ao projeto autorizado `ukwulespvvthyjqgrjfo` após dry-run listar exclusivamente esse arquivo. Ela cria `ops_api_metric_buckets`, `ops_runtime_events`, `ops_job_runs`, `ops_alert_state` e o watermark privado `ops_alert_snapshot_state`, além dos RPCs `record_ops_api_metric`, `start_ops_job` e `sync_operational_alerts`.

Todas as tabelas têm RLS ativo e nenhum acesso para `anon` ou `authenticated`. O `service_role` recebe somente os privilégios necessários; inserções de métricas, início de jobs, sincronização e retenção passam por funções `SECURITY DEFINER` com `search_path` fixo. Não há `DROP`, `TRUNCATE`, reset, repair ou exclusão de dados de negócio. A retenção controlada remove somente telemetria com mais de 31 dias e jobs terminais com mais de 90 dias.

O histórico remoto confirmou `20261005140000` alinhada entre local e produção. As tabelas existentes eram pequenas antes dos dois índices incrementais (`collector_runs=42`, `ai_usage_logs=111`), reduzindo o risco de lock durante a aplicação.

## Testes

`test:2.7` valida regras seletivas, health mínimo, cobertura das 18 rotas, agregação de métricas, buckets de cinco minutos, validação de entradas, métodos HEAD/OPTIONS, RLS/ACL, `SECURITY DEFINER`, upsert atômico, lifecycle de jobs, aquisição exclusiva, deduplicação, resolução, reabertura e rejeição de snapshots atrasados ou futuros.

TypeScript, lint completo, build de produção, `git diff --check` e `npm audit --omit=dev` passaram; o audit encontrou zero vulnerabilidades. Todas as suítes históricas das Sprints 1.3.1 a 2.7 passaram, junto com contratos canonical/API/frontend, security, persistence e orçamento físico de IA. O build gerou 27 rotas/páginas.

O smoke `test:2.7:live` no Supabase real confirmou: leitura anônima negada, métrica persistida, aquisição concorrente de job recusada, job de validação encerrado como `SKIPPED`, sincronização de alertas executada e nenhuma anomalia ativa (`alerts=0`, `runtimeEvents=0`). Nenhum dado de concurso, documento, usuário ou evidência foi alterado.

## Commit, CI e deployment

A preencher após push, conclusão do GitHub Actions e deployment Vercel.

## Production smoke

A preencher após o deployment da aplicação.

## Riscos residuais

- Alertas são internos ao painel e ao estado operacional. Integração com e-mail, webhook ou pager exige escolha e autorização explícita de um destino externo.
- O p95 é um limite superior derivado de histograma (`100`, `500`, `1000`, `3000` ou `>3000 ms`), não um percentil exato por evento.
- Eventos de erro usam códigos e componentes sanitizados; diagnóstico detalhado continua dependendo dos logs protegidos da plataforma.

## Estado final

Banco e implementação validados. O fechamento depende de commit, CI, deployment e production smoke.
