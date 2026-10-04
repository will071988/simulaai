# Sprint 2.6 — Admin / Operations

Data de atualização: 04/10/2026. **Estado: em validação, não fechada.**

## Escopo

Painel privado para saúde do coletor, fontes, fila de IA, documentos falhos, concursos conflitantes, candidatos a duplicata, esquemas inválidos, orçamento de IA, execuções recentes e falhas de fonte. Ações controladas: retentar documento, aprovar/rejeitar candidato de fonte e registrar revisão de conflito. Sem SQL livre nem comandos arbitrários.

## Implementação

- `/admin/operacoes` carrega somente dados de `/api/admin/operations`; a API verifica token Supabase, usuário permanente com e-mail confirmado e vínculo `ADMIN` em cada requisição. Respostas privadas usam `no-store`.
- `ops_admin_members` começa vazio: nenhuma conta recebe privilégio automaticamente. Atribuição inicial depende da conta indicada pelo proprietário.
- `ops_apply_action` aceita apenas quatro ações, verifica novamente o vínculo admin no banco e grava a mutação e a auditoria na mesma transação. A revisão de conflito registra nota, sem alterar a classificação factual do concurso. Aprovar candidato não ativa automaticamente um adaptador desconhecido.
- Tabelas operacionais têm RLS, sem políticas para `anon`/`authenticated`, e a função privilegiada é executável somente por `service_role`.
- O painel descarta respostas assíncronas antigas após troca de sessão/logout.
- O painel permite atualização explícita e detalha documentos pendentes de IA, tentativas futuras, falhas de IA nos últimos sete dias e execuções com esquema inválido. Em caso de resposta incerta a uma ação, recarrega estado e auditoria antes de recomendar nova tentativa.

## Banco

Migração aditiva `20261004203913_admin_operations.sql` aplicada ao projeto Supabase autorizado `ukwulespvvthyjqgrjfo` após dry-run mostrar apenas ela. Não contém DROP, TRUNCATE, DELETE, reset ou reparo de histórico. Verificação remota: 0 administradores, 0 ações, 32 documentos, 13 candidatos, 23 concursos; RLS ativo nas novas tabelas; `anon`/`authenticated` sem EXECUTE na função, `service_role` com EXECUTE. A análise de segurança aponta três avisos informativos esperados de RLS sem política nas novas tabelas privadas e nenhum novo alerta de função privilegiada pública; demais alertas preexistem e não pertencem a esta migração.

## Testes

`test:2.6` valida esquema estrito de entrada, URLs, negação de API anônima, autorização no banco, quatro ações auditadas, preservação de dados e rejeição de comando arbitrário. A função remota também recusou um usuário não vinculado com `OPS_FORBIDDEN`, sem alterar dados. TypeScript, lint completo, build de produção e `npm audit --omit=dev` (zero vulnerabilidades) passaram.

O teste de banco também comprova que a aprovação grava revisor, URL oficial e trilha de auditoria e satisfaz o gatilho de governança para ativação controlada de uma fonte; um candidato rejeitado não satisfaz esse gatilho. Essa prova usa somente dados efêmeros de teste, sem ativar adaptadores ou candidatos na produção.

Uma checagem remota somente de leitura encontrou 0 documentos pendentes de IA, 1 ocorrência de esquema inválido nas últimas 20 execuções e 63 falhas de IA em sete dias. Esses dados motivaram a exibição detalhada; a visualização autenticada no painel ainda não foi comprovada.

## Commit, CI e deployment

Implementação em `aa31f7eaadaff67947b5544fbb124aebd44fb447`, enviada a `origin/main`. GitHub Actions `37234141359` para esse SHA: sucesso. Deployment Vercel `dpl_ACU2ZpJhsNwfw3gttRcdmgzAPJES`: production Ready, alias `https://simulaai-kappa.vercel.app`.

## Production smoke público

No alias de produção, `/admin/operacoes` responde 200 com `noindex`; `/api/admin/operations` responde 401 tanto a GET quanto a POST sem token. Chrome exibiu apenas o convite para entrar, sem métricas ou dados operacionais. A página pública não comprova o caminho autenticado, ainda pendente.

## Pendências de fechamento

- Conta de administrador indicada e papel concedido explicitamente; nenhum acesso por inferência de e-mail.
- Smoke de produção autenticado, incluindo leitura e ação com conta admin autorizada.
- Confirmar comportamento de aprovação de fontes no fluxo operacional real sem ativar adaptador não suportado.

**SPRINT 2.6 ABERTA.** Não iniciar 2.7 antes dos gates e da validação autenticada.
