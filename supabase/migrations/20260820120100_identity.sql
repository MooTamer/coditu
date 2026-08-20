-- Coditu — profiles and the sign-up allowlist.

create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  full_name               text not null,
  initials                text not null,
  avatar_url              text,
  role                    app_role not null default 'engineer',
  -- Invariant 2: minutes, never floating hours. 2400 = 40h.
  weekly_capacity_minutes int not null default 2400 check (weekly_capacity_minutes >= 0),
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.profiles.weekly_capacity_minutes is
  'Invariant 2: integer minutes. Divide by 60 at the render edge only.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- No public sign-up.
--
-- The allowlist is enforced by a trigger on auth.users, not by a check in the
-- UI or an edge function. Supabase's sign-up endpoint is public by design, so
-- anything short of a database-level refusal is a door with a sign on it.
-- ---------------------------------------------------------------------------

create table public.allowed_emails (
  email      text primary key,
  note       text,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.allowed_emails is
  'Sign-up allowlist. Enforced by a before-insert trigger on auth.users — never client-side.';

create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.allowed_emails a
    where lower(a.email) = lower(new.email)
  ) then
    raise exception 'sign-up is not open: % is not on the allowlist', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_email_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- A profile row is created for every new user, so `profiles` is never missing a
-- row for a live session. Name and initials fall back to the email local-part
-- until the person edits them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_part text := split_part(new.email, '@', 1);
  display    text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), local_part);
begin
  insert into public.profiles (id, full_name, initials, role)
  values (
    new.id,
    display,
    upper(left(regexp_replace(display, '[^[:alpha:] ]', '', 'g'), 1)) ||
      upper(coalesce(substr(split_part(display, ' ', 2), 1, 1), '')),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'engineer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
