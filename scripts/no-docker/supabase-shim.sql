-- Minimal Supabase-shaped scaffolding for a bare Postgres 16 cluster.
-- Enough for supabase/migrations/* to apply and supabase/tests/rls.sql to run.
-- NOT a substitute for the real stack: no GoTrue, no PostgREST, no storage API.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists graphql_public;
create schema if not exists realtime;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgtap with schema extensions;

-- Whatever database this is being loaded into, not one called `postgres`.
--
-- `alter database postgres set …` is what this used to say, and it is right
-- exactly once: the README's walkthrough happens to use `postgres`. Load the
-- shim into any other database — a rehearsal copy, a second cluster — and the
-- statement silently configures a database you are not connected to. Nothing
-- fails until `supabase/seed.sql` reaches `gen_salt('bf')`, which lives in
-- `extensions` and is suddenly not on the path.
--
-- `alter database` takes a name and not an expression, so this is the shape it
-- has to be. Every migration qualifies its own calls (`extensions.gen_random_uuid()`);
-- the search_path is for the seed and for anybody typing at a psql prompt.
do $$
begin
  execute format(
    'alter database %I set search_path = %s, public, extensions',
    current_database(),
    quote_literal('$user')
  );
end$$;

-- Roles ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then
    create role supabase_realtime_admin nologin noinherit;
  end if;
end$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant usage on schema storage to anon, authenticated, service_role, postgres;

-- auth ----------------------------------------------------------------------
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text default null unique,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

create unique index if not exists users_email_partial_key
  on auth.users (email) where is_sso_user = false;

create table if not exists auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid primary key default extensions.gen_random_uuid(),
  unique (provider_id, provider)
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ), '')::text
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.email', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  ), '')::text
$$;

-- `auth.sign` ships in the real stack via pgjwt; only the signature matters here.
create or replace function auth.sign(payload json, secret text, algorithm text default 'HS256')
returns text language sql stable as $$
  select encode(convert_to(payload::text, 'utf8'), 'base64')
$$;

grant execute on function auth.uid, auth.jwt, auth.role, auth.email
  to anon, authenticated, service_role, postgres;
grant select on auth.users to postgres, service_role;

-- storage -------------------------------------------------------------------
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table if not exists storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

-- The real stack guards direct SQL deletes behind this GUC; see
-- docs/07-FIELD-NOTES.md, "storage.objects refuses a direct SQL delete".
create or replace function storage.protect_objects_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Deleting from storage.objects is not allowed' using errcode = '42501';
  end if;
  return null;
end
$$;

drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete before delete on storage.objects
  execute function storage.protect_objects_delete();

grant all on storage.objects, storage.buckets to postgres, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- realtime ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;
