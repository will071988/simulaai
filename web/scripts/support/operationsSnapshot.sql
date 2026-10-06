begin read only;
select
  (select count(*) from public.collector_sources) as sources,
  (select count(*) from public.collector_documents) as documents,
  (select count(*) from public.source_candidates) as candidates,
  (select count(*) from public.ops_admin_members) as admins,
  (select count(*) from public.ops_admin_members m join auth.users u on u.id=m.user_id
    where u.email='williamrocha6@gmail.com' and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and u.deleted_at is null) as exact_verified_admins,
  (select md5(coalesce(jsonb_agg(jsonb_build_array(id,name,hostname,base_url,adapter,tier,source_type,enabled,health_status,failure_count,last_error_code) order by id)::text,'[]')) from public.collector_sources) as sources_fingerprint,
  (select md5(coalesce(jsonb_agg(jsonb_build_array(id,status,content_hash) order by id)::text,'[]')) from public.collector_documents) as documents_fingerprint,
  (select md5(coalesce(jsonb_agg(jsonb_build_array(id,status) order by id)::text,'[]')) from public.source_candidates) as candidates_fingerprint,
  exists(select 1 from pg_attribute where attrelid='public.source_candidates'::regclass and attname='operational_source_id' and not attisdropped) as destination_column,
  exists(select 1 from pg_constraint where conrelid='public.source_candidates'::regclass and conname='source_candidates_operational_source_id_fkey') as destination_relation,
  to_regprocedure('public.ops_approve_source(uuid,uuid,text,text,boolean)') is not null as approval_rpc,
  case when to_regprocedure('public.ops_approve_source(uuid,uuid,text,text,boolean)') is not null
    then has_function_privilege('anon','public.ops_approve_source(uuid,uuid,text,text,boolean)','execute') end as anon_execute,
  case when to_regprocedure('public.ops_approve_source(uuid,uuid,text,text,boolean)') is not null
    then has_function_privilege('authenticated','public.ops_approve_source(uuid,uuid,text,text,boolean)','execute') end as authenticated_execute,
  case when to_regprocedure('public.ops_approve_source(uuid,uuid,text,text,boolean)') is not null
    then has_function_privilege('service_role','public.ops_approve_source(uuid,uuid,text,text,boolean)','execute') end as service_execute,
  position('INSUFFICIENT_IDENTITY' in pg_get_functiondef('public.ops_apply_action(uuid,text,uuid,text,text)'::regprocedure))>0 as permanent_retry_guard;
rollback;
