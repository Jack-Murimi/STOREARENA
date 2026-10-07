-- Nobody may change their own role, branches or active flag.
--
-- The RLS policies on app_users only allow admin/director to write, but that
-- leaves an admin free to edit their own row - and more importantly it leaves
-- the rule expressed as a policy rather than as a fact. A BEFORE UPDATE
-- trigger cannot be talked around by a cleverly-scoped policy, and it holds
-- even if a future policy is loosened by mistake.
--
-- Branches live in user_branches, so granting yourself a branch is the same
-- escalation by another door and is blocked the same way.

create or replace function public.block_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'you cannot change your own role';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'you cannot change your own active flag';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_no_self_escalation on public.app_users;
create trigger app_users_no_self_escalation
  before update on public.app_users
  for each row execute function public.block_self_escalation();

-- Granting yourself a branch, or taking one away, is the same act.
create or replace function public.block_own_branch_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.user_id = auth.uid())
     or (tg_op = 'DELETE' and old.user_id = auth.uid()) then
    raise exception 'you cannot change your own branch access';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists user_branches_no_self_change on public.user_branches;
create trigger user_branches_no_self_change
  before insert or delete on public.user_branches
  for each row execute function public.block_own_branch_change();

-- Deactivation is how a leaver is handled, so make sure it is possible: an
-- admin deactivating SOMEONE ELSE is allowed by the trigger above, and nobody
-- can delete a user row at all (revoked in 0001).
