-- Published questions are served through the API projection, which strips answers
-- and isCorrect flags. Direct table SELECT bypasses that disclosure contract.
-- No data or RLS policies are changed. Server/service-role paths remain available.
begin;
revoke select on table public.questoes from public, anon, authenticated;
grant select on table public.questoes to service_role;
commit;
