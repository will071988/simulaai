alter table collector_documents add column if not exists binary_hash text;
alter table collector_documents add column if not exists text_hash text;
