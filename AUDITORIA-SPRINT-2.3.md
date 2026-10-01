# Auditoria da Sprint 2.3 — Concursos favoritos e alertas

Data: 01/10/2026
Status: concluída

## Escopo entregue

- Usuário autenticado pode favoritar e seguir concursos de forma independente.
- Central `/acompanhamento` reúne concursos disponíveis, estado de favorito/seguimento e notificações in-app.
- Eventos suportados: novo edital, retificação, inscrição aberta, inscrição encerrando, prova marcada e mudança relevante.
- Notificações possuem estado de leitura individual e contador de não lidas.
- Nenhum canal de e-mail foi ativado sem infraestrutura apropriada.

## Eventos e controle de spam

- Mudanças do coletor geram eventos somente depois de aprovadas pela invariável existente de evidência factual.
- Documentos originais e retificações geram eventos por trigger, com `event_key` único.
- Abertura de inscrições é materializada apenas durante a janela vigente; encerramento somente nos três dias finais.
- Materialização e fanout usam chaves únicas e `ON CONFLICT DO NOTHING`, portanto reexecuções não duplicam alertas.
- Apenas `is_following=true` recebe eventos; favoritar sem seguir não produz notificações.

## Segurança e privacidade

- Migração incremental `20261001100000_contest_follows_and_notifications.sql` cria seguimentos, eventos e entregas por usuário.
- RLS isola favoritos, seguimentos, entregas e marcação de leitura por `auth.uid()`; `anon` não possui acesso.
- APIs `/api/follows` e `/api/notifications` exigem bearer válido, filtram pelo usuário autenticado e usam `cache-control: no-store`.
- Exclusão da conta remove seguimentos e entregas por cascata.

## Evidências automatizadas

- `npm run test:2.3`: taxonomia completa, ausência de e-mail, fanout idempotente, favorito sem spam, materialização temporal, leitura e isolamento entre usuários.
- Regressão completa de 1.3.1 a 2.3: aprovada.
- `npm run lint`, `npx tsc --noEmit` e `npm run build`: aprovados.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto e gates

- Dry-run listou somente `20261001100000_contest_follows_and_notifications.sql`; migração aplicada sem operação destrutiva ou reparo de histórico.
- Commit de implementação: `0bf3df27351019fcf7c6837875064b46fc20eb49`, publicado em `origin/main`.
- GitHub Actions: execução `36940215562`, concluída com sucesso em todos os gates.
- Deployment Vercel: `dpl_AH8Bp4PKgHsLnAjrUEN9r9TY7pmp`, status `Ready`, com alias `https://simulaai-kappa.vercel.app`.
- Smoke HTTP: `/acompanhamento` retornou 200; `/api/follows` e `/api/notifications` sem bearer retornaram 401.
- Smoke visual no Chrome: central publicada exibiu navegação “Alertas”, proposta sem e-mail repetitivo e CTA de autenticação sem vazar conteúdo pessoal.
- Como a confirmação por caixa postal está habilitada, não foi criada identidade fictícia em produção; fanout, favoritos, leitura e isolamento foram comprovados no PostgreSQL isolado.
