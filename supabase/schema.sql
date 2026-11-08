create table if not exists public.user_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('exercises', 'sets', 'workouts', 'routines')),
  record_id text not null,
  payload jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

alter table public.user_records enable row level security;

drop policy if exists "Users can read their own records" on public.user_records;
drop policy if exists "Users can insert their own records" on public.user_records;
drop policy if exists "Users can update their own records" on public.user_records;
drop policy if exists "Users can delete their own records" on public.user_records;

create policy "Users can read their own records"
  on public.user_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own records"
  on public.user_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own records"
  on public.user_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own records"
  on public.user_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_records to authenticated;

-- Resolve concurrent uploads in a single database operation. The user ID is
-- always taken from the authenticated session, never from client input.
create or replace function public.apply_user_record(
  p_collection text,
  p_record_id text,
  p_payload jsonb,
  p_deleted boolean,
  p_updated_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_records (user_id, collection, record_id, payload, deleted, updated_at)
  values (auth.uid(), p_collection, p_record_id, p_payload, p_deleted, p_updated_at)
  on conflict (user_id, collection, record_id) do update
  set payload = excluded.payload,
      deleted = excluded.deleted,
      updated_at = excluded.updated_at
  where user_records.updated_at < excluded.updated_at;
end;
$$;

revoke all on function public.apply_user_record(text, text, jsonb, boolean, timestamptz) from public, anon;
grant execute on function public.apply_user_record(text, text, jsonb, boolean, timestamptz) to authenticated;

-- Batch uploads remain atomic, including repeated edits to the same record.
create or replace function public.apply_user_records(p_records jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  record jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) > 100 then
    raise exception 'Expected at most 100 records';
  end if;
  for record in select value from jsonb_array_elements(p_records) loop
    perform public.apply_user_record(
      record->>'collection', record->>'record_id', record->'payload',
      (record->>'deleted')::boolean, (record->>'updated_at')::timestamptz
    );
  end loop;
end;
$$;

revoke all on function public.apply_user_records(jsonb) from public, anon;
grant execute on function public.apply_user_records(jsonb) to authenticated;

create index if not exists user_records_sync_order
  on public.user_records (user_id, updated_at, collection, record_id);
