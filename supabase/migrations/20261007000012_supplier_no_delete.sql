-- The suppliers table got the set_updated_at trigger but never got the
-- no-delete guard the other purchase tables have, so a supplier could be
-- deleted out from under its invoices. refuse_hard_delete() already exists;
-- this only attaches it.
drop trigger if exists suppliers_no_delete on public.suppliers;
create trigger suppliers_no_delete
  before delete on public.suppliers
  for each row execute function public.refuse_hard_delete();
