# Auditoria da Sprint 1.9 — Explicações e correção inteligente

Data: 01/10/2026
Status: implementação concluída; gates remotos finais em andamento

## Escopo entregue

- Correção individual por questão depois da conclusão autenticada da tentativa.
- Resposta correta, explicação, justificativa específica de cada alternativa errada e referência conceitual.
- Campo `explanation_quality` de 0 a 1, acompanhado por confiança e estado editorial.
- Conteúdo somente é exibido quando `quality_status = VALIDATED`, confiança mínima de 80% e qualidade mínima de 80%.
- Explicações abaixo do limiar permanecem armazenadas como rascunho/rejeitadas, mas não são reveladas ao aluno.
- Cache por hash canônico com chave única e vínculo reutilizável entre questão e explicação.
- Caminho de IA cache-first, no máximo uma chamada por requisição, entrada limitada, saída de no máximo 800 tokens e recusa antes da chamada quando a fonte tem baixa confiança.
- As dez questões publicadas existentes usam explicações autorais validadas; nenhuma chamada externa de IA foi necessária.
- Interface de resultado mostra a correção completa e sinaliza explicitamente quando uma explicação ainda não é confiável.

## Banco e segurança

- Migração incremental `20261001060000_trusted_explanation_cache.sql`.
- Tabelas `explanation_cache` e `question_explanations` com RLS e acesso direto negado a `anon`/`authenticated`.
- Cache impõe unicidade, limites de tokens, faixas de qualidade/confiança e gate de conteúdo validado.
- `complete_simulado_attempt` continua validando o bearer token e calculando a nota no servidor; somente então retorna `corrections`.
- Função auxiliar de correção não é executável por clientes públicos.
- Gabarito e explicações continuam ausentes do payload de geração/início do simulado.
- Nenhuma operação destrutiva, reset, `TRUNCATE`, reparo de histórico ou alteração de migração aplicada foi usada.

## Evidências automatizadas

- `npm run test:1.9`: schema completo, cobertura de alternativas erradas, gate de confiança, cache reuse, orçamento de IA, divulgação pós-conclusão, unicidade e RLS.
- Regressão completa de 1.3.1 a 1.9: aprovada.
- `npm run lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto

- Dry-run listou somente `20261001060000_trusted_explanation_cache.sql`.
- Migração aplicada com sucesso ao projeto Supabase vinculado.

## Gates remotos finais

- Commit/push: pendente.
- GitHub Actions: pendente.
- Deployment Vercel: pendente.
- Smoke de produção e Chrome: pendente.
