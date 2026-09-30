-- Requeue only the records affected by the official-URL identity bug fixed in
-- the application. Their history and prior failure metadata remain auditable.
update collector_documents
set ai_retry_count = 0,
    ai_next_attempt_at = now(),
    ai_claimed_at = null,
    ai_claim_token = null,
    ai_claimed_hash = null
where status = 'AI_PENDING'
  and ai_last_error_code = 'SYNC_FAILED'
  and metadata->>'sync_error' like '%concursos_edital_url_key%';
