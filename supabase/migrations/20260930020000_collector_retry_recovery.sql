-- A changed document is a new processing attempt; stale retry exhaustion must
-- not prevent it from being resolved. Successful persistence also clears the
-- retry state atomically through this trigger.
create or replace function reset_processed_document_retry_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'PROCESSED' then
    new.ai_retry_count := 0;
    new.ai_next_attempt_at := null;
    new.ai_last_error_code := null;
    new.ai_claimed_at := null;
    new.ai_claim_token := null;
    new.ai_claimed_hash := null;
  end if;
  return new;
end;
$$;

create trigger collector_documents_reset_processed_retry
before insert or update of status on collector_documents
for each row execute function reset_processed_document_retry_state();

-- Recover only pending sync work that inherited the exhausted counter from an
-- older content version. No document or audit history is removed.
update collector_documents
set ai_retry_count = 0,
    ai_next_attempt_at = now(),
    ai_claimed_at = null,
    ai_claim_token = null,
    ai_claimed_hash = null
where status = 'AI_PENDING'
  and ai_last_error_code = 'SYNC_FAILED'
  and ai_retry_count >= 3;

-- These official sites currently reject or terminate this collector's
-- standards-compliant requests. Keep their records and history, but stop
-- treating unreliable adapters as active sources.
update collector_sources
set enabled = false,
    last_status = 'DISABLED_UNRELIABLE',
    last_error_code = case name
      when 'Instituto AOCP' then 'HTTP_403'
      when 'DOU' then 'UPSTREAM_CONNECTION_FAILED'
      else last_error_code
    end
where name in ('Instituto AOCP', 'DOU')
  and failure_count >= 5;
