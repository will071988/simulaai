# Sprint 2.5 — Página profissional do concurso

Data de atualização: 04/10/2026. **Estado: fechada, com limitação de teste autenticado registrada.**

## Objetivo

Página pública confiável de concurso, com proveniência, separação entre fatos e previsões, documentos, localidade, SEO e ações reais.

## Estado inicial

Implementação inicial em `85391eb2dcadb2dc841187bde7bfe3c7b2d9effd`. A revisão encontrou confirmação indevida de listas/localidade, SEO sem a mesma política factual da página, corrida no carregamento de favoritos e CTA apontando para simulados estáticos.

## Implementado

- Política compartilhada de evidência para página, metadata e JSON-LD: cada item de uma lista precisa de suporte oficial; cada campo geográfico é validado separadamente.
- Status sem evidência não é confirmado pelo selo de qualidade do cadastro. Previsões sem suporte oficial são explicitamente identificadas.
- JSON-LD `WebPage` com breadcrumb e data de modificação, sem apresentar concurso multicarreira ou previsão como uma vaga individual.
- ID inválido é rejeitado antes da consulta UUID; URLs de evidência/documento aceitam somente HTTP(S) sem credenciais.
- Preferências carregadas antes de permitir escrita, serialização de cliques, descarte de respostas antigas, recarga após falha ambígua e limpeza na troca de sessão/unmount.
- CTA para gerador real com ID canônico; pré-seleção valida disponibilidade pública e presença de questões. Falhas têm mensagem e tentativa novamente.

## Banco

Migração incremental `20261002032516_remove_nonfactual_cookie_evidence.sql` aplicada via CLI ao projeto autorizado `ukwulespvvthyjqgrjfo` em 04/10/2026, após dry-run indicando somente essa migração. Apesar do nome histórico, **não exclui registros**.

- Coluna gerada `invalidation_reason` marca `NONFACTUAL_COOKIE_BANNER`, inclusive em futuras repetições.
- Consultas do coletor e página/API ignoram registros inválidos. As funções de mudanças e persistência/publicação também os desconsideram.
- Antes/depois: 102 registros; assinatura MD5 de IDs, valores e trechos `645159fa206d1ca1df4cec5c4f7d7edf`, idêntica.
- 10 registros invalidados; 2 concursos publicados preservados.

## Segurança

Sem DROP, TRUNCATE, DELETE, reset ou repair nesta migração. RLS existente preservada. `persist_contest_document` mantém execução exclusiva de `service_role`, com `search_path = public`. Segredos não registrados neste relatório.

## Testes

Testados localmente: suíte 2.5 (proveniência, apresentação, controlador de preferências, pré-seleção e PostgreSQL), idempotência do coletor, contratos canonical/merged, exposição da API, TypeScript e lint. Testes de banco verificam preservação de conteúdo, rejeição de mudanças sem evidência válida, reaplicação e privilégios.

Regressão completa configurada no CI executada localmente com sucesso (1.3.1 até 2.5, contratos, segurança, SSRF, persistência, publicação, observabilidade e idempotência). Build de produção concluído com sucesso. `npm audit --omit=dev`: zero vulnerabilidades. `git diff --check`: aprovado. Esses resultados locais não substituem o CI remoto e o smoke de produção.

## Regressões e métricas

Dados remotos preservados conforme comparação acima. O parser agora descarta escolaridade genérica como cargo sem descartar nomes reais como `Técnico em Informática`. O Chrome em produção exibiu Salvador sem cargo indevidamente confirmado e Macaé com apenas os fatos vinculados a evidência. Os dois concursos publicados permanecem navegáveis pela busca.

## Commit

Hardening: `0f9d92f3fb78f421d9befa29b158f63e9a667f06`. Correção adicional do parser, proveniência e dados históricos: `1da3409f3b00bf77bc134e538e752575cc062694`. Ambos enviados para `origin/main`.

## CI

GitHub Actions `37216630574`, SHA `0f9d92f3fb78f421d9befa29b158f63e9a667f06`: concluído com sucesso. GitHub Actions `37217391200`, SHA `1da3409f3b00bf77bc134e538e752575cc062694`: concluído com sucesso.

## Deployment

Deployment anterior `dpl_428gbkGFm8WAc8U3TWK4U5N34YtS`. Deployment atualizado `dpl_HGJitG1SdJCRsQZ3LSywGm1n2rte`, production Ready, com alias `https://simulaai-kappa.vercel.app`.

## Production Smoke

Chrome em produção após o deployment atualizado: Salvador exibe previsão não confirmada, cargo ausente como “Não confirmado”, campos ausentes sem confirmação e nenhuma evidência de cookies. CTA abre o motor real e informa corretamente que Salvador ainda não tem questões publicadas, sem selecionar outro concurso silenciosamente. O clique anônimo em Favoritar leva à autenticação, sem marcar falsamente a preferência. A busca lista os dois concursos; Macaé exibe órgão, banca e localidade com evidência, mas não confirma status, vagas, salário, cargos ou datas sem suporte.

**Achado e correção:** o parser classificava `Nível Superior` como cargo. A correção do parser e da proveniência tem regressões que preservam cargos reais como `Técnico em Informática` e exigem trecho próprio por cargo. Reteste visual aprovado no deployment atualizado.

Smoke HTTP no alias de produção: páginas e APIs de Salvador e Macaé retornam 200; página e API para ID inválido retornam 404. O HTML de Salvador inclui canonical correto, título específico e JSON-LD `WebPage`, não `JobPosting`. Nenhum banner de cookies aparece no HTML dessas páginas. Fluxos autenticados não foram exercitados em produção por indisponibilidade de credenciais de teste; o controlador de preferências foi coberto por testes locais.

Migração adicional `20261004162956_quarantine_schooling_as_role.sql` aplicada após dry-run em 04/10/2026: amplia a invalidação gerada, preserva o valor canônico anterior em `concurso_field_corrections` (RLS e sem acesso público) e corrige Salvador para lista de cargos vazia. Auditoria remota: 1 correção preservada; 102 evidências com a mesma assinatura original; 13 invalidadas no total. Os 3 casos adicionais foram inspecionados: `Nível Superior` e duas ocorrências históricas de `Nível Médio de`, todos sem nome de cargo real. Nenhum registro de evidência foi excluído.

## Riscos residuais

Campos sem evidência permanecem não confirmados. A disponibilidade de simulados depende de questões publicadas. Não houve smoke autenticado de Favoritar/Acompanhar; isso exige uma conta de teste autorizada e permanece como limitação explícita, sem bloquear a verificação pública da página.

## Estado final

**SPRINT 2.5 FECHADA.** Implementação, regressões, migrações seguras, CI, deploy e smoke público verificados. A limitação de teste autenticado fica registrada para regressão posterior.
