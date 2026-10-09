-- Restrict SimulaAí AI budget reservation RPC to trusted server-side execution only.
revoke execute on function public.reserve_ai_daily_budget(integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_daily_budget(integer) to service_role;
