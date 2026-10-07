-- 0001 — app_users, user_branches and the role helpers everything else uses.
--
-- Identity is auth.users.id. RLS never compares an email: an email can be
-- changed, and a claim the user can edit is not an identity. app_users.email is
-- citext and unique so staff can be pre-registered and looked up by the invite
-- flow, but authorisation keys off auth.uid().
--
-- role and is_active live HERE, not in user_metadata and not in JWT claims.
-- Anything a user can write about themselves is not an access control.
--
-- Branch access is a separate user_branches table rather than a single
-- branch_id column, so one person can cover two branches without a schema
-- change later.

create extension if not exists citext with schema extensions;

create table if not exists public.app_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      extensions.citext not null unique,
  full_name  text not null,
  role       text not null check (role in ('attendant','manager','admin','director')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_users is
  'Authorisation only. Identity lives in auth.users; nothing here is user-editable.';

-- One row per branch a person may act in. No branch_id on app_users, so a
-- person with no row has no branch and can only be admin/director.
create table if not exists public.user_branches (
  user_id    uuid not null references public.app_users (id) on delete cascade,
  branch_id  text not null references public.stock_locations (id),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id),
  primary key (user_id, branch_id)
);

create index if not exists user_branches_branch_idx on public.user_branches (branch_id);

-- ---- helpers ---------------------------------------------------------------
-- All SECURITY DEFINER + STABLE + pinned search_path, so a caller cannot shadow
-- a referenced object via their own search_path.

create or replace function public.current_app_user()
returns public.app_users
language sql stable security definer
set search_path = public
as $$
  select u.*
    from public.app_users u
   where u.id = auth.uid()
     and u.is_active;
$$;

create or replace function public.current_app_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.current_app_user();
$$;

-- Kept for callers that expect a single branch: the first granted branch,
-- deterministically ordered so it does not change between calls.
create or replace function public.current_branch_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select ub.branch_id
    from public.user_branches ub
   where ub.user_id = auth.uid()
   order by ub.branch_id
   limit 1;
$$;

-- The one to use in policies: is this user allowed to act in THIS branch?
create or replace function public.user_has_branch(p_branch_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_branches ub
      join public.app_users u on u.id = ub.user_id
     where ub.user_id = auth.uid()
       and ub.branch_id = p_branch_id
       and u.is_active
  );
$$;

create or replace function public.is_admin_or_director()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','director') from public.current_app_user()), false);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

-- ---- who may administer users ---------------------------------------------
alter table public.app_users    enable row level security;
alter table public.user_branches enable row level security;

-- A user may read their own row (the UI needs name, role, branch). Only
-- admin/director may read anyone else's, and only they may create or change.
drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users
  for select to authenticated
  using (id = auth.uid() or public.is_admin_or_director());

drop policy if exists app_users_insert on public.app_users;
create policy app_users_insert on public.app_users
  for insert to authenticated with check (public.is_admin_or_director());

drop policy if exists app_users_update on public.app_users;
create policy app_users_update on public.app_users
  for update to authenticated
  using (public.is_admin_or_director())
  with check (public.is_admin_or_director());

revoke delete on public.app_users from authenticated, anon;

drop policy if exists user_branches_select on public.user_branches;
create policy user_branches_select on public.user_branches
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_director());

drop policy if exists user_branches_write on public.user_branches;
create policy user_branches_write on public.user_branches
  for insert to authenticated with check (public.is_admin_or_director());

drop policy if exists user_branches_update on public.user_branches;
create policy user_branches_update on public.user_branches
  for update to authenticated
  using (public.is_admin_or_director())
  with check (public.is_admin_or_director());

revoke delete on public.user_branches from authenticated, anon;
