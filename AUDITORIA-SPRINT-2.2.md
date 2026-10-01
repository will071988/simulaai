# Auditoria da Sprint 2.2 — Plano de estudos personalizado

Data: 01/10/2026
Status: concluída

## Escopo entregue

- Plano autenticado por concurso, cargo, data da prova, tempo diário e disciplinas selecionadas.
- Agenda diária de até catorze dias, com soma exata do tempo disponível informado.
- Distribuição quantitativa considera peso relativo das questões, fraqueza medida, frequência de erros e proximidade da prova.
- Disciplinas sem histórico recebem sinal neutro explícito, sem inventar desempenho.
- O plano salvo é recalculado ao ser carregado quando o fingerprint do desempenho muda ou começa um novo dia.
- Interface `/plano` oferece configuração, distribuição por disciplina, justificativas mensuráveis e agenda diária.

## Determinismo e adaptação

- O motor em `web/src/lib/study-plan/engine.ts` é puro: entradas idênticas produzem resultados idênticos.
- Pesos vêm da quantidade de questões publicadas para o concurso/cargo; quando não há recorte específico, usa-se o banco publicado das disciplinas selecionadas.
- Fraqueza e frequência de erros vêm exclusivamente de `get_user_progress`.
- Proximidade da prova define a urgência e o horizonte da agenda, sem delegar decisão quantitativa à IA.
- Melhora de precisão e redução de erros diminuem deterministicamente a alocação da disciplina, redistribuindo o tempo diário.

## Persistência, segurança e privacidade

- Migração incremental `20261001090000_adaptive_study_plans.sql` cria planos vinculados a `auth.users` e `concursos`.
- RLS restringe leitura, criação, alteração e exclusão ao próprio `auth.uid()`; `anon` não possui acesso.
- Exclusão da conta remove os planos pessoais por `ON DELETE CASCADE`.
- `/api/study-plan` exige bearer token válido em leitura e gravação, valida payload estrito e responde com `cache-control: no-store`.
- A service role é usada somente no backend e todas as operações persistentes recebem o ID autenticado.

## Evidências automatizadas

- `npm run test:2.2`: determinismo, soma exata do tempo, urgência por proximidade, adaptação ao desempenho e validação de entrada.
- Teste PostgreSQL: propriedade estrita, invisibilidade/imutabilidade entre dois usuários, bloqueio de `anon` e cascata de exclusão.
- Regressão completa de 1.3.1 a 2.2: aprovada.
- `npm run lint`, `npx tsc --noEmit` e `npm run build`: aprovados.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto e gates

- Dry-run listou somente `20261001090000_adaptive_study_plans.sql`; migração aplicada com sucesso, sem operação destrutiva ou reparo de histórico.
- Commit de implementação: `f12484fea2f59613ca64b07017f879ac239e442c`, publicado em `origin/main`.
- GitHub Actions: execução `36848484519`, concluída com sucesso em todos os gates.
- Deployment Vercel: `dpl_DAaBv8HdbxBgScSNWHRHtJvxx7zJ`, status `Ready`, com alias `https://simulaai-kappa.vercel.app`.
- Smoke HTTP: `/plano` retornou 200; GET sem autenticação e POST com bearer inválido em `/api/study-plan` retornaram 401.
- Smoke visual no Chrome: página publicada mostrou a proposta adaptativa, vínculo à conta e CTA de autenticação sem expor dados pessoais.
- Como a confirmação por caixa postal está habilitada, não foi criada identidade fictícia em produção; criação/atualização do plano e adaptação ao desempenho foram comprovadas pelo motor e PostgreSQL isolado.
