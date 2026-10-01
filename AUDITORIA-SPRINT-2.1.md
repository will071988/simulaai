# Auditoria da Sprint 2.1 — Histórico e progresso

Data: 01/10/2026
Status: concluída

## Escopo entregue

- Tentativas iniciadas por usuário autenticado passam a registrar o proprietário; o fluxo anônimo permanece disponível e sem histórico pessoal.
- Dashboard pessoal substitui os indicadores fictícios por dados calculados exclusivamente a partir de tentativas concluídas.
- Resumo apresenta simulados concluídos, pontuação média, tempo médio, questões respondidas, acertos, erros e precisão.
- Histórico lista os vinte simulados mais recentes e a evolução os ordena cronologicamente.
- Desempenho por disciplina apresenta quantidade respondida, acertos, erros e precisão, além das três disciplinas mais fortes e das três prioridades de revisão.
- Estados de carregamento, usuário desconectado, erro e histórico vazio são explícitos.

## Banco e derivação dos dados

- Migração incremental `20261001080000_user_progress_dashboard.sql` adiciona a chave estrangeira entre tentativa e `auth.users`, preservando tentativas de contas excluídas como dados anônimos por `ON DELETE SET NULL`.
- A sobrecarga de `create_simulado_attempt` valida a existência do usuário e vincula a tentativa na mesma transação da criação.
- A RPC `get_user_progress` considera apenas tentativas `COMPLETED` do usuário recebido e deriva todas as métricas diretamente de respostas, gabaritos, pontuação e tempos persistidos.
- Não existem palpites, metas inventadas ou métricas preenchidas por fallback no dashboard; conta sem tentativas recebe zeros e listas vazias.

## Segurança e privacidade

- `/api/progress` exige bearer token válido, consulta somente o ID devolvido pelo Supabase Auth e responde com `cache-control: no-store`.
- Bearer inválido na criação de simulado é rejeitado; requisição sem bearer continua anônima.
- RPCs de vínculo e progresso foram revogadas de `public`, `anon` e `authenticated`, com execução exclusiva por `service_role` no backend.
- O teste isolado comprova que um segundo usuário recebe histórico vazio e que clientes `anon`/`authenticated` não executam a RPC diretamente.

## Evidências automatizadas

- `npm run test:2.1`: contrato autenticado da API/UI e PostgreSQL real com duas tentativas controladas, dois usuários, médias, tempo, acertos/erros, evolução, disciplinas e isolamento.
- Regressão completa de 1.3.1 a 2.1: aprovada.
- `npm run lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado, incluindo `/dashboard` e `/api/progress`.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto

- Dry-run listou somente `20261001080000_user_progress_dashboard.sql`.
- Migração aplicada com sucesso ao projeto Supabase vinculado.
- Nenhuma operação destrutiva, reset, reparo de histórico ou edição de migração já aplicada foi usada.

## Gates remotos

- Commit de implementação: `9fa093a944fbe19ae142e4774b0b2ce077ebd371`, publicado em `origin/main`.
- GitHub Actions: execução `36846484675`, concluída com sucesso em todos os gates.
- Deployment Vercel: `dpl_HVDNeDTxXGK78bzvHAKmUyRWP9zm`, status `Ready`, com alias `https://simulaai-kappa.vercel.app`.
- Smoke HTTP: `/dashboard` retornou 200; `/api/progress` sem bearer retornou 401; opções de simulado continuaram em 200; bearer inválido na criação retornou 401.
- Smoke visual no Chrome: dashboard publicado exibiu o estado desconectado, informou que somente tentativas autenticadas entram no histórico e ofereceu acesso à conta, sem números simulados.
- Como a confirmação por caixa postal está habilitada, não foi criada identidade fictícia em produção; o fluxo autenticado completo e o isolamento entre usuários foram comprovados no PostgreSQL isolado com a mesma cadeia de migrações.
