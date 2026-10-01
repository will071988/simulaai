# Sprint 1.7 — Banco Real de Questões

Data da validação: 30/09/2026  
Projeto Supabase autorizado: `ukwulespvvthyjqgrjfo`

## Objetivo

Criar uma infraestrutura profissional de questões, com origem inequívoca, validação estrutural, proteção autoral e publicação fail-closed.

## Modelo

`questoes` agora possui `concurso_id`, `disciplina`, `assunto`, `subassunto`, `enunciado`, `alternativas`, `resposta_correta`, `explicacao`, `dificuldade`, `origem`, `banca`, `ano`, `cargo`, `source_url`, `source_type`, `quality_status`, `created_at`, metadados de validação, fingerprint e `updated_at`.

Os campos legados (`gabarito`, `tema`, `fonte_url`) foram preservados e sincronizados para compatibilidade; nenhum dado foi apagado.

## Origem e Copyright

- Origens: `QUESTAO_OFICIAL`, `QUESTAO_AUTORAL`, `QUESTAO_IA`.
- Questão de IA não pode declarar banca oficial e deve usar `AI_GENERATED`.
- Questão oficial exige fonte pública oficial HTTPS.
- Domínios privados protegidos conhecidos são rejeitados para ingestão pública.
- O prompt de geração exige questão inédita, sem cópia e sem atribuição a banca.
- Duas questões autorais originais percorrem no banco o fluxo completo `DRAFT → VALIDATED → PUBLISHED`.

## Schema Validation

Validação TypeScript/Zod e trigger PostgreSQL detectam:

- alternativa/chave duplicada;
- resposta ausente;
- mais de uma resposta correta;
- divergência entre flag correta e `resposta_correta`;
- enunciado curto/inválido;
- explicação ausente ou incompatível;
- origem/proveniência incoerente;
- fonte privada protegida;
- duplicidade lógica por fingerprint.

## Quality Gate

- Estados: `DRAFT`, `VALIDATED`, `REJECTED`, `PUBLISHED`.
- Inserts devem começar em `DRAFT`.
- `DRAFT → PUBLISHED` é recusado.
- `VALIDATED/PUBLISHED` exigem `validated_at`, `validated_by` e lista vazia de erros.
- RLS pública retorna somente `PUBLISHED`.
- `/api/questoes` filtra novamente por `PUBLISHED` e remove gabarito, explicação, validador e flags `isCorrect`.

## Banco

Migration incremental aplicada e alinhada local/remoto:

- `20260930040000_professional_question_bank.sql`

Nenhum `db reset`, `migration repair`, `DROP` ou `TRUNCATE` foi usado.

## Testes

- Schema, origem, copyright, geração, transições e sanitização pública.
- PostgreSQL/PGlite com trigger real, rejeições, fluxo editorial completo e RLS published-only.
- Todas as regressões 1.3.1–1.6, canonical, frontend, API, segurança, SSRF, persistência, publicação, observabilidade e idempotência passaram.
- `npm run lint` passou.
- `npx tsc --noEmit` passou.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run build`: Next.js 16.3.8, 15 páginas/rotas, incluindo `/api/questoes`.

## Gates Remotos

- Commit de implementação: `37c65c28db42f6f3dfe7804ef9d8ddf39cf0a4e3` (`feat: build validated question bank`).
- GitHub Actions: run `36803693319`, concluída com **success** em todas as etapas, incluindo `test:1.7`, regressões, lint, TypeScript, audit e build.
- Evidência: <https://github.com/will071988/simulaai/actions/runs/36803693319>
- Vercel deployment: `dpl_Ft9FAfEn2zAN27LhGCX6WYopJ78c`, estado **Ready**.
- URL imutável: <https://simulaai-3iz9q3r2c-williamrocha6-5180s-projects.vercel.app>
- O alias customizado inicialmente permaneceu no deployment anterior; foi explicitamente promovido para a versão validada e reinspecionado.
- Alias de produção confirmado: <https://simulaai-kappa.vercel.app>

## Production Smoke

- `/`, `/dashboard`, `/quiz`, `/simulados`, `/simulados/pf-cebraspe-01`, `/api/collector`, `/api/concursos`, `/api/concursos/hot` e `/api/questoes`: HTTP `200`.
- CSP presente, `X-Frame-Options: DENY` e `X-Content-Type-Options: nosniff` nas nove rotas.
- `/api/questoes` retornou 2 questões `QUESTAO_AUTORAL` publicadas (Matemática e Raciocínio Lógico).
- Payload público não contém `resposta_correta`, `explicacao` ou `isCorrect`.
- `main` e `origin/main` correspondem ao commit de implementação no momento do deployment.

## Estado

Implementação, banco funcional, validação local, CI, deployment e production smoke concluídos. **SPRINT 1.7 FECHADA**.
