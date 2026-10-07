-- 0003 — the append-only audit log and the triggers that write to it.
--
-- Two adaptations to the brief worth flagging:
--
--   record_id is TEXT, not uuid. purchase_invoice_lines.id is a bigint
--   identity, so a uuid column could not hold it. Text holds both.
--
--   The actor is recorded as auth.uid() plus the email and role at the time.
--   uid is the identity and what joins to app_users; email and role are copied
--   in so the history stays readable if the person is later deactivated.
--
-- audit_log is the one table no application role may write to. It is written
-- only by the SECURITY DEFINER trigger below, which runs as the table owner and
-- therefore is not subject to the table's own RLS. There are deliberately no
-- INSERT/UPDATE/DELETE policies, and the DML privileges are revoked as well, so
-- there are two independent reasons a user cannot alter history.

create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid,
  actor_email    text,
  actor_role     text,
  table_name     text not null,
  record_id      text not null,
  action         text not null check (action in ('INSERT','UPDATE','DELETE')),
  reason         text,
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[]
);

alter table public.audit_log enable row level security;

-- Read for admin/director only. No insert, update or delete policy exists.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_admin_or_director());

revoke insert, update, delete, truncate on public.audit_log from authenticated, anon;
revoke insert, update, delete, truncate on public.audit_log from public;

-- Only the owner may write, and only the trigger runs as the owner.
revoke all on public.audit_log from anon;
grant select on public.audit_log to authenticated;

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_id     text;
  v_fields text[];
  k        text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id  := (to_jsonb(old) ->> 'id')::text;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_id  := (to_jsonb(new) ->> 'id')::text;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id  := (to_jsonb(new) ->> 'id')::text;
    -- The list of columns whose value actually changed, ignoring the audit
    -- columns themselves so a touched_at update does not look like an edit.
    -- Use jsonb_each's real column names. Aliasing them to (k, val) made the
    -- reference ambiguous and every UPDATE through this trigger failed with
    -- "column reference k is ambiguous" - which is every void and every edit.
    select array_agg(x.key order by x.key) into v_fields
      from jsonb_each(v_new) as x
     where x.value is distinct from v_old -> x.key
       and x.key not in ('updated_at','updated_by');
  end if;

  insert into public.audit_log (
    actor_id, actor_email, actor_role, table_name, record_id,
    action, reason, old_data, new_data, changed_fields
  ) values (
    coalesce(auth.uid(), null),
    (select email::text from public.current_app_user()),
    public.current_app_role(),
    tg_table_name,
    v_id,
    tg_op,
    nullif(current_setting('app.change_reason', true), ''),
    v_old, v_new, v_fields
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists suppliers_audit on public.suppliers;
create trigger suppliers_audit
  after insert or update or delete on public.suppliers
  for each row execute function public.audit_trigger_fn();

drop trigger if exists purchase_invoices_audit on public.purchase_invoices;
create trigger purchase_invoices_audit
  after insert or update or delete on public.purchase_invoices
  for each row execute function public.audit_trigger_fn();

drop trigger if exists purchase_lines_audit on public.purchase_invoice_lines;
create trigger purchase_lines_audit
  after insert or update or delete on public.purchase_invoice_lines
  for each row execute function public.audit_trigger_fn();

drop trigger if exists supplier_payments_audit on public.supplier_payments;
create trigger supplier_payments_audit
  after insert or update or delete on public.supplier_payments
  for each row execute function public.audit_trigger_fn();

drop trigger if exists supplier_price_quotes_audit on public.supplier_price_quotes;
create trigger supplier_price_quotes_audit
  after insert or update or delete on public.supplier_price_quotes
  for each row execute function public.audit_trigger_fn();

-- Editing a posted invoice or payment is an admin/director act and needs a
-- stated reason. The version bump gives the RPC something to check against so
-- two people editing the same invoice cannot silently overwrite each other.
create or replace function public.guard_posted_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(current_setting('app.change_reason', true)), '');
begin
  if old.status in ('posted','void') then
    if not public.is_admin_or_director() then
      raise exception 'only an admin or director may change a % record (invoice %)',
        old.status, old.id;
    end if;
    if v_reason is null or length(v_reason) < 10 then
      raise exception 'changing a % record requires a reason of at least 10 characters',
        old.status;
    end if;
  end if;

  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists purchase_invoices_guard on public.purchase_invoices;
create trigger purchase_invoices_guard
  before update on public.purchase_invoices
  for each row execute function public.guard_posted_edit();

drop trigger if exists supplier_payments_guard on public.supplier_payments;
create trigger supplier_payments_guard
  before update on public.supplier_payments
  for each row execute function public.guard_posted_edit();
