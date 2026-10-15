-- Restrict SimulaAí rate-limit RPC to trusted server-side execution only.
revoke execute on function public.consume_api_rate_limit(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, timestamptz, integer) to service_role;
