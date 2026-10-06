# Sprint 2.6 — Admin / Operations

Data de fechamento: 05/10/2026. **Estado: fechada.**

## Escopo

Painel privado para saúde do coletor, fontes, fila de IA, documentos falhos, concursos conflitantes, candidatos a duplicata, esquemas inválidos, orçamento de IA, execuções recentes e falhas de fonte. Ações controladas: retentar documento, aprovar/rejeitar candidato de fonte e registrar revisão de conflito. Sem SQL livre nem comandos arbitrários.

## Implementação

- `/admin/operacoes` carrega somente dados de `/api/admin/operations`; a API verifica token Supabase, usuário permanente com e-mail confirmado e vínculo `ADMIN` em cada requisição. Respostas privadas usam `no-store`.
- `ops_admin_members` começa vazio: nenhuma conta recebe privilégio automaticamente. Atribuição inicial depende da conta indicada pelo proprietário.
- `ops_apply_action` aceita apenas quatro ações, verifica novamente o vínculo admin no banco e grava a mutação e a auditoria na mesma transação. A revisão de conflito registra nota, sem alterar a classificação factual do concurso. Aprovar candidato não ativa automaticamente um adaptador desconhecido.
- Tabelas operacionais têm RLS, sem políticas para `anon`/`authenticated`, e a função privilegiada é executável somente por `service_role`.
- O painel descarta respostas assíncronas antigas após troca de sessão/logout.
- O painel permite atualização explícita e detalha documentos pendentes de IA, tentativas futuras, falhas de IA nos últimos sete dias e execuções com esquema inválido. Em caso de resposta incerta a uma ação, recarrega estado e auditoria antes de recomendar nova tentativa.
- O smoke autenticado revelou que o retry aceitava falhas permanentes de identidade. O fluxo foi endurecido em TypeScript, UI e PostgreSQL: somente erros transitórios ou de formato são retryable; `INSUFFICIENT_IDENTITY` encerra fail-closed e o RPC repete a validação dentro da transação.
- Os smokes autenticados usam magic-link efêmero somente em memória, sem senha, token em log ou persistência de sessão de teste.

## Banco

Migração aditiva `20261004203913_admin_operations.sql` aplicada ao projeto Supabase autorizado `ukwulespvvthyjqgrjfo` após dry-run mostrar apenas ela. Não contém DROP, TRUNCATE, DELETE, reset ou reparo de histórico. Verificação remota logo após a migração: 0 administradores, 0 ações, 32 documentos, 13 candidatos, 23 concursos; RLS ativo nas novas tabelas; `anon`/`authenticated` sem EXECUTE na função, `service_role` com EXECUTE. A análise de segurança aponta três avisos informativos esperados de RLS sem política nas novas tabelas privadas e nenhum novo alerta de função privilegiada pública; demais alertas preexistem e não pertencem a esta migração.

Após indicação explícita do proprietário, `williamrocha6@gmail.com` foi confirmado no Auth como usuário permanente, ativo e com e-mail verificado. O vínculo `ADMIN` foi inserido somente para o respectivo `auth.users.id`, com predicados de ID e e-mail exatos, e `ON CONFLICT DO NOTHING`. Consulta independente posterior mostrou `total_admins = 1` e `exact_verified_admins = 1`. Nenhuma outra conta recebeu acesso.

A migration incremental `20261005120000_restrict_admin_document_retry.sql` foi aplicada após dry-run listar exclusivamente esse arquivo. Ela preserva o `SECURITY DEFINER` com `search_path = public, pg_temp`, mantém execução apenas para `service_role`, restringe retries e encerra pendências já comprovadas como `INSUFFICIENT_IDENTITY`. Nenhum documento, log ou evidência foi excluído. Estado posterior: `AI_PENDING=0`.

## Testes

`test:2.6` valida esquema estrito de entrada, URLs, negação de API anônima, autorização no banco, quatro ações auditadas, preservação de dados, rejeição de comando arbitrário e bloqueio de retry permanente. A função remota também recusou um usuário não vinculado com `OPS_FORBIDDEN`, sem alterar dados. TypeScript, lint completo, build de produção e `npm audit --omit=dev` (zero vulnerabilidades) passaram.

O teste de banco também comprova que a aprovação grava revisor, URL oficial e trilha de auditoria e satisfaz o gatilho de governança para ativação controlada de uma fonte; um candidato rejeitado não satisfaz esse gatilho. Essa prova usa somente dados efêmeros de teste, sem ativar adaptadores ou candidatos na produção.

Todas as suítes das Sprints 1.3.1 a 2.6, contratos canonical/API/frontend, security, SSRF, persistence, publication policy, collector observability e idempotency passaram localmente. O build gerou 26 rotas/páginas. O secret scan de arquivos versionados não encontrou credenciais.

## Commit, CI e deployment

Implementação inicial em `aa31f7eaadaff67947b5544fbb124aebd44fb447`. Hardening final em `8cd0b72c` (`fix: restrict administrative document retries`), enviado a `origin/main` sem reescrita de histórico. GitHub Actions `37307491642`: sucesso em todas as etapas. Deployment Vercel `dpl_GtVxgfqEhCYvoxxPwjJJu62nMn7a`: Production Ready, URL imutável `https://simulaai-4mrpt9bks-williamrocha6-5180s-projects.vercel.app` e alias `https://simulaai-kappa.vercel.app`.

## Production smoke

- `/admin/operacoes` respondeu 200; `/api/admin/operations` respondeu 401 para GET e POST sem token.
- CSP, HSTS, `X-Frame-Options: DENY` e `X-Content-Type-Options: nosniff` foram confirmados.
- A conta admin autorizada recebeu 200 na API privada com `Cache-Control: private, no-store`; o painel reportou 0 AI pending, 18 documentos falhos, 6 conflitos, 0 duplicatas e 13 candidatos de fonte.
- Chrome headless real carregou a sessão efêmera e renderizou “Saúde do coletor”, “Fila de IA” e “Ações recentes”, sem tela de login ou `ADMIN_ONLY`.
- Uma ação real `RETRY_DOCUMENT` foi gravada na auditoria. O worker recusou a página de navegação “Contatos” por identidade insuficiente, sem criar concurso; o hardening subsequente encerrou a pendência e tornou os 18 retries permanentes indisponíveis.
- O health público `/api/collector` respondeu 200. Logs e banco confirmaram uma chamada OpenRouter gratuita no smoke operacional, sem provider pago.

## Riscos residuais

- Existem 18 documentos permanentemente falhos, 6 concursos conflitantes e 13 candidatos de fonte. Eles permanecem visíveis para curadoria, sem retry automático inseguro ou publicação factual.
- Cebraspe permanece `DEGRADED` sem falhas consecutivas; fontes desabilitadas continuam preservadas no registry.
- Os avisos do GitHub Actions sobre runtime das actions e futura imagem Ubuntu são informativos; o gate executou em Node 24 e passou.

## Estado final

Painel privado, RBAC, ações allowlisted, auditoria, banco, CI, deployment e smokes público/autenticado validados. **SPRINT 2.6 FECHADA.**

O [complemento operacional](AUDITORIA-OPERACOES-COMPLEMENTO.md) registra a validação adicional de destino da aprovação de fonte e detalhe privado de conflitos, com seus próprios gates de publicação. O fechamento acima descreve a versão originalmente validada.
