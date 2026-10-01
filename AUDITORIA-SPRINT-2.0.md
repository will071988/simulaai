# Auditoria da Sprint 2.0 — Autenticação e conta do usuário

Data: 01/10/2026
Status: implementação concluída; gates remotos finais em andamento

## Escopo entregue

- Identidade persistente com Supabase Auth.
- Cadastro e login por e-mail/senha; senha mínima de oito caracteres na interface.
- Link mágico para contas existentes, sem criar usuário implicitamente.
- Nenhum provedor social adicionado.
- Sessão persistida e renovada pelo SDK; estado da navegação acompanha eventos de autenticação.
- Logout local disponível na página da conta.
- Exclusão permanente de conta após confirmação textual explícita.
- Navegação passa a apontar para conta/painel conforme a sessão.

## Perfil e minimização

- Migração incremental `20261001070000_user_identity_and_profiles.sql`.
- `user_profiles` contém apenas `user_id`, `nome`, `created_at` e `updated_at`.
- Trigger cria o perfil junto com `auth.users`; usuários existentes recebem backfill idempotente.
- Schema da API rejeita campos extras, inclusive e-mail, evitando coleta desnecessária no perfil.
- Exclusão de `auth.users` remove o perfil por `ON DELETE CASCADE`.

## Segurança

- RLS habilitada com políticas separadas de select/insert/update/delete baseadas em `auth.uid()`.
- `anon` não possui acesso à tabela de perfis.
- API `/api/account` exige bearer token e valida o usuário no Supabase antes de ler, alterar ou excluir.
- Operações com service role sempre recebem filtro pelo ID autenticado.
- Exclusão administrativa não é exposta sem JWT válido do próprio usuário.
- Respostas privadas usam `cache-control: no-store`.

## Evidências automatizadas

- `npm run test:2.0`: parsing estrito de bearer token, schema mínimo, rejeição de campos extras, trigger de perfil, RLS entre dois usuários e cascata de exclusão.
- Regressão completa de 1.3.1 a 2.0: aprovada.
- `npm run lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado, incluindo `/conta` e `/api/account`.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprovado.

## Banco remoto

- Dry-run listou somente `20261001070000_user_identity_and_profiles.sql`.
- Migração aplicada com sucesso ao projeto Supabase vinculado.
- Nenhuma operação destrutiva, reset, reparo de histórico ou edição de migração aplicada foi usada.

## Gates remotos finais

- Commit/push: pendente.
- GitHub Actions: pendente.
- Deployment Vercel: pendente.
- Smoke de produção/Chrome: pendente.
