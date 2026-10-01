-- Follow-up hardening: attempt bearer-token hashes must never be reused.
create unique index if not exists simulado_attempts_token_hash_unique on simulado_attempts(session_token_hash);
