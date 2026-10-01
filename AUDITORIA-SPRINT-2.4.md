# Auditoria da Sprint 2.4 — Busca e descoberta de concursos

Data: 01/10/2026
Status: concluída

## Escopo entregue

- Página pública `/concursos` com busca por órgão, cargo, banca, cidade, estado, nível, salário e status.
- Filtros de abrangência nacional, federal, estadual e municipal, além de período de inscrição.
- Ordenação por mais recentes, inscrições encerrando, salário, vagas e relevância (`hot_score`).
- Paginação obrigatória no banco, com 24 itens por padrão e limite absoluto de 50 por requisição.
- Contagem total e número de páginas retornados pelo servidor, inclusive quando a página solicitada está além do último resultado.

## Busca nacional e desempenho

- Função parametrizada `search_public_contests` executa filtros, ordenação, contagem e paginação no PostgreSQL.
- Busca geral inclui órgão, título, banca, cidade e cargos; cargo aceita correspondência parcial e sem diferença de maiúsculas/minúsculas.
- O filtro federal deriva órgãos federais de concursos nacionais sem classificar todo concurso nacional como federal.
- Índices parciais cobrem publicação canônica, data, encerramento, salário, vagas, relevância, estado, abrangência, órgão, banca e cidade.
- Somente concursos publicáveis e não mesclados entram nos resultados; a função retorna explicitamente apenas o contrato público.

## Segurança e banco

- Migrações incrementais `20261001110000_contest_search_indexes.sql` e `20261001111000_public_contest_search_rpc.sql` aplicadas sem reset, reparo ou operação destrutiva.
- A função usa `SECURITY INVOKER`, preserva RLS, remove privilégio de execução de `public` e libera somente `anon` e `authenticated`.
- Parâmetros são validados com Zod; termos são normalizados e limites de salário inválidos ou páginas fora do contrato retornam 400.
- Nenhuma carga integral do banco é feita no frontend.

## Evidências automatizadas

- `npm run test:2.4`: filtros, limites, ordenações, busca parcial por cargo, distinção federal/nacional, paginação, total em página vazia e contrato público aprovados.
- Regressão completa de 1.3.1 a 2.4, contratos de publicação, observabilidade e idempotência: aprovada.
- `npm run lint`, `npx tsc --noEmit` e `npm run build`: aprovados.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## CI, deploy e produção

- Commits de implementação: `6f4f2c6b6820844e646a395565f76c70446346e1`, `00ca2979caba0dca84fc9d58b7c7a3f46a83f683` e `76b4bf707f6c0532c9be5f5228fb451652da7ec2`, publicados em `origin/main`.
- GitHub Actions final da implementação: execução `36942968299`, concluída com sucesso em todos os gates.
- Deployment Vercel: `dpl_HPEvqAML1aZbmyTMZgKgEid43FA1`, status `Ready`, com alias `https://simulaai-kappa.vercel.app`.
- Smoke HTTP: `/concursos` retornou 200; página limitada a dois itens retornou 200; `perPage=500` retornou 400; filtros de cargo e abrangência retornaram contrato paginado válido.
- Smoke visual no Chrome: todos os filtros e ordenações apareceram; a busca parcial por `superior` reduziu os dois resultados publicados para um e o botão Limpar restaurou os dois concursos.
