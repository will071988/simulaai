-- Sprint 2.3: favorites, follows and in-app notification events.
create table contest_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  concurso_id uuid not null references concursos(id) on delete cascade,
  is_favorite boolean not null default false,
  is_following boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, concurso_id),
  check (is_favorite or is_following)
);

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  concurso_id uuid not null references concursos(id) on delete cascade,
  event_type text not null check (event_type in ('NOVO_EDITAL','RETIFICACAO','INSCRICAO_ABERTA','INSCRICAO_ENCERRANDO','PROVA_MARCADA','MUDANCA_RELEVANTE')),
  title text not null,
  message text not null,
  event_key text not null unique,
  source_url text,
  created_at timestamptz not null default now()
);

create table user_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references notification_events(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id, event_id)
);

alter table contest_follows enable row level security;
alter table notification_events enable row level security;
alter table user_notifications enable row level security;
revoke all on table contest_follows, notification_events, user_notifications from public, anon;
grant all on table contest_follows, notification_events, user_notifications to service_role;
grant select, insert, update, delete on table contest_follows to authenticated;
grant select, update on table user_notifications to authenticated;
grant select on table notification_events to authenticated;

create policy "users manage own contest follows" on contest_follows for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read delivered events" on notification_events for select to authenticated using (exists (
  select 1 from user_notifications un where un.event_id = notification_events.id and un.user_id = auth.uid()
));
create policy "users read own notifications" on user_notifications for select to authenticated using (auth.uid() = user_id);
create policy "users mark own notifications" on user_notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index contest_follows_user_updated on contest_follows(user_id, updated_at desc);
create index contest_follows_contest_following on contest_follows(concurso_id) where is_following;
create index user_notifications_user_created on user_notifications(user_id, created_at desc);

create function fanout_notification_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into user_notifications(user_id, event_id)
  select user_id, new.id from contest_follows where concurso_id = new.concurso_id and is_following
  on conflict do nothing;
  return new;
end;
$$;
create trigger notification_event_fanout after insert on notification_events for each row execute function fanout_notification_event();

create function notify_contest_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type text; v_title text; v_contest text;
begin
  select titulo into v_contest from concursos where id = new.concurso_id;
  v_type := case
    when new.field_name = 'edital_url' and new.old_value is null then 'NOVO_EDITAL'
    when new.field_name in ('inscricao_inicio','inscricao_fim') then 'MUDANCA_RELEVANTE'
    when new.field_name = 'prova_data' then 'PROVA_MARCADA'
    else 'MUDANCA_RELEVANTE' end;
  v_title := case v_type when 'NOVO_EDITAL' then 'Novo edital' when 'PROVA_MARCADA' then 'Data da prova atualizada' else 'Mudança relevante' end;
  insert into notification_events(concurso_id,event_type,title,message,event_key,source_url)
  values(new.concurso_id,v_type,v_title,v_contest || ': ' || replace(new.field_name,'_',' ') || ' foi atualizado.','change:' || new.id,new.source_url)
  on conflict(event_key) do nothing;
  return new;
end;
$$;
create trigger contest_change_notification after insert on concurso_changes for each row execute function notify_contest_change();

create function notify_contest_document() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type text; v_title text; v_contest text;
begin
  if coalesce(new.relationship_type, '') not in ('ORIGINAL','RETIFICATION','REPUBLICATION','REOPENING') then return new; end if;
  select titulo into v_contest from concursos where id = new.concurso_id;
  v_type := case when new.relationship_type = 'ORIGINAL' then 'NOVO_EDITAL' else 'RETIFICACAO' end;
  v_title := case when v_type = 'NOVO_EDITAL' then 'Novo edital' else 'Retificação publicada' end;
  insert into notification_events(concurso_id,event_type,title,message,event_key,source_url)
  values(new.concurso_id,v_type,v_title,v_contest || ': novo documento oficial identificado.','document:' || new.id,new.source_url)
  on conflict(event_key) do nothing;
  return new;
end;
$$;
create trigger contest_document_notification after insert on concurso_documents for each row execute function notify_contest_document();

create function materialize_deadline_notifications(p_user_id uuid, p_today date default current_date) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'AUTH_USER_NOT_FOUND'; end if;
  insert into notification_events(concurso_id,event_type,title,message,event_key)
  select distinct c.id, 'INSCRICAO_ABERTA', 'Inscrições abertas', c.titulo || ': o período de inscrições está aberto.',
    'registration-open:' || c.id || ':' || c.inscricao_inicio::text
  from concursos c join contest_follows f on f.concurso_id = c.id and f.is_following
  where c.inscricao_inicio is not null and c.inscricao_inicio <= p_today and (c.inscricao_fim is null or c.inscricao_fim >= p_today)
  on conflict(event_key) do nothing;

  insert into notification_events(concurso_id,event_type,title,message,event_key)
  select distinct c.id, 'INSCRICAO_ENCERRANDO', 'Inscrições encerrando', c.titulo || ': as inscrições encerram em ' || to_char(c.inscricao_fim,'DD/MM/YYYY') || '.',
    'registration-closing:' || c.id || ':' || c.inscricao_fim::text
  from concursos c join contest_follows f on f.concurso_id = c.id and f.is_following
  where c.inscricao_fim between p_today and p_today + 3
  on conflict(event_key) do nothing;

  insert into user_notifications(user_id,event_id)
  select p_user_id, e.id from notification_events e
  join contest_follows f on f.concurso_id = e.concurso_id and f.user_id = p_user_id and f.is_following
  where e.event_key like 'registration-open:%' or e.event_key like 'registration-closing:%'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function fanout_notification_event(), notify_contest_change(), notify_contest_document(), materialize_deadline_notifications(uuid,date) from public, anon, authenticated;
grant execute on function materialize_deadline_notifications(uuid,date) to service_role;
