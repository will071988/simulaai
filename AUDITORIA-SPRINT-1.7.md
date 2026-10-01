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

Pendente de commit, push, CI, deployment e production smoke desta versão.

## Estado

Implementação, banco e validação local concluídos. A Sprint 1.7 permanece aberta até os gates remotos ficarem verdes.
