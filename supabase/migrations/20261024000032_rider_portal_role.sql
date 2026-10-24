-- Rider accounts have a login, but are permanently scoped to their own rider row.
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('attendant', 'manager', 'admin', 'director', 'rider'));
create unique index if not exists riders_user_id_key on public.riders (user_id) where user_id is not null;
