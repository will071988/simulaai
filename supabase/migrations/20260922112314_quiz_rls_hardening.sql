-- Harden RLS quiz_responses: anon should NOT read/update all. Server uses service_role, so revoke anon policies and keep only minimal insert via service_role.
-- First drop permissive policies
drop policy if exists "anon insert quiz" on quiz_responses;
drop policy if exists "anon select own quiz" on quiz_responses;
drop policy if exists "anon update own quiz" on quiz_responses;
-- No anon policies: quiz_responses accessible only via service_role (via API routes)
-- Ensure RLS still enabled but no anon access
