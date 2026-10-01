# Auditoria da Sprint 1.8 — Motor real de simulados

Data: 30/09/2026
Status: concluída

## Escopo entregue

- Geração por concurso, cargo, disciplina, assunto, banca, nível, dificuldade e quantidade.
- Modos `RAPIDO`, `COMPLETO`, `POR_MATERIA`, `POR_ASSUNTO` e `PROVA_SIMULADA`.
- Seleção determinística por semente, distribuição-alvo de dificuldade e preferência por questões ainda não vistas.
- Persistência de simulado, ordem das questões e tentativa em uma única função transacional.
- Tentativa identificada por sessão e bearer token aleatório; somente o hash do token é persistido.
- Cálculo de acertos, nota e duração no PostgreSQL. O navegador nunca envia nem define a nota.
- Conclusão idempotente: uma segunda chamada não altera respostas nem nota já consolidadas.
- Interface completa em `/simulados`: selecionar, iniciar, responder, finalizar e receber nota.
- Banco de questões original adicional para os concursos INSS e PF, passando por `DRAFT → VALIDATED → PUBLISHED`.

## Modelo e segurança

- Migração incremental `20260930050000_simulado_engine.sql`.
- Hardening incremental `20260930051000_attempt_token_uniqueness.sql`.
- Novas tabelas: `simulado_questions` e `simulado_attempts`.
- Campos de tentativa: sessão/usuário, simulado, início, conclusão, respostas, nota, acertos, duração e status.
- Escrita e leitura direta de tentativas negadas a `anon` e `authenticated`.
- Funções `create_simulado_attempt` e `complete_simulado_attempt` executáveis somente por `service_role`.
- Políticas públicas legadas da tabela `tentativas` removidas.
- Questões `DRAFT`, `VALIDATED` ou `REJECTED` não podem entrar em um simulado.
- Payload público das questões não contém `resposta_correta`, `explicacao` ou marca `isCorrect`.
- O campo `config` persistido não contém identificador de sessão nem histórico de questões do usuário.

## Evidências automatizadas

- `npm run test:1.8`: seleção determinística, filtros, distribuição, repetição, tokens, atomicidade, nota autoritativa, idempotência e RLS.
- Regressão completa de 1.3.1 a 1.8: aprovada.
- `npm run lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado, incluindo as rotas dinâmicas de geração e conclusão.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto

- Histórico remoto estava alinhado até `20260930040000` antes da Sprint.
- Dry-run listou apenas `20260930050000_simulado_engine.sql`; aplicação concluída.
- Segundo dry-run listou apenas `20260930051000_attempt_token_uniqueness.sql`; aplicação concluída.
- Nenhum `DROP TABLE`, `TRUNCATE`, reset, reparo de histórico ou operação destrutiva foi usado.
- O smoke local com o banco remoto não foi possível porque o arquivo de ambiente exportado pela Vercel mascara a service key como `[SENSITIVE]`. A prova end-to-end será feita no deployment protegido da Vercel.

## Gates remotos finais

- Commit de implementação: `3c4e950f65f20090cef59824959ba5032172fbd5`, publicado em `origin/main`.
- GitHub Actions: execução `36805649004`, concluída com sucesso em todos os gates.
- Deployment Vercel: `dpl_DnirCcmdCBzaEn6fv41mEn3Eizqx`, status `Ready`, com alias `https://simulaai-kappa.vercel.app`.
- Smoke HTTP/API em produção: página 200 com CSP; 2 concursos com questões; tentativa PF de 3 questões criada e concluída; zero campos de resposta vazados; nota injetada `999` ignorada; conclusão repetida idempotente.
- Smoke visual no Chrome: PF selecionada, três questões respondidas e resultado visível com “CORREÇÃO CONCLUÍDA NO SERVIDOR”, `100,00%` e `3 acertos em 3 questões`.
