#!/bin/sh
# Fresh DB that mimics Supabase's default grants, migrate, then ask whether a
# signed-in user may UPDATE users.role. Prints the privilege flags.
# Usage (from packages/db): sh ../../scripts/check-rls-users.sh  — needs a local Postgres at $U
set -e
U=${PG_ADMIN_URL:-postgres://postgres@127.0.0.1:54329}
DB=flowers_rls
psql $U/postgres -qc "drop database if exists $DB" -c "create database $DB" >/dev/null
psql $U/$DB -q <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated;
-- Stub of Supabase's storage.buckets so 0024's bucket insert runs.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
-- Supabase-like auth.uid() (reads the JWT sub) so the RLS policies behave as in prod.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable
  as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public, auth to anon, authenticated;
SQL
# Journaled migrations (through 0023), then the manually applied idempotent ones.
DIRECT_DATABASE_URL=$U/$DB pnpm exec drizzle-kit migrate >/dev/null 2>&1
for f in $(ls migrations/*.sql | sort); do
  n=$(basename "$f" | cut -c1-4)
  [ "$n" -gt 23 ] && psql $U/$DB -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
psql $U/$DB -tAc "select 'role_update=' || has_column_privilege('authenticated','public.users','role','UPDATE') || ' name_update=' || has_column_privilege('authenticated','public.users','full_name','UPDATE') || ' anon_update=' || has_table_privilege('anon','public.users','UPDATE')"
# Behavioural check: a signed-in buyer PATCHes their own row to role=admin (what PostgREST would run).
psql $U/$DB -qtA <<'SQL' 2>&1 | grep -v '^$'
insert into public.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'buyer@example.test');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.users set role = 'admin' where id = auth.uid();
commit;
select 'self_promote_result_role=' || role from public.users where email = 'buyer@example.test';
SQL
