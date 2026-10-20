-- ============================================================================
-- 0031 — classify gas cylinders by the catalogue, not by a hardcoded category
-- ============================================================================
--
-- Categories in this database are created by staff through the inventory screen
-- and named by size ("13KG", "6KG", "22-5KG", "WATER", "ACCESSORIES"). The sale
-- RPC, however, decided what it was selling by testing `c.code = 'LPG'`, a code
-- that only exists in the demo seed. Against the real catalogue every cylinder
-- line fell through to the final branch and was rejected:
--
--     line_type_not_allowed:13KG AFRIGAS 13 KG
--
-- so no cylinder could be sold at all. The two empty-return lookups had the
-- same test, which would have failed a refill with 'refill_needs_empty_brand'
-- even after the first check was relaxed.
--
-- `stock_model = 'CYLINDER'` is the schema's own answer to "is this a cylinder",
-- but two non-cylinder categories in this database carry that value, so the
-- predicate is: an explicit LPG code, or a CYLINDER model that is not one of
-- the known non-gas categories. One function so the sale RPC and the dashboard
-- cannot drift apart.
--
-- Backward compatible: a catalogue that really does use code 'LPG' behaves
-- exactly as before.
-- ============================================================================

begin;

create or replace function public.is_gas_cylinder(p_code text, p_stock_model text)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select coalesce(p_code, '') = 'LPG'
      or (
           coalesce(p_stock_model, '') = 'CYLINDER'
           and upper(coalesce(p_code, '')) not in ('WATER', 'ACC', 'ACCESSORIES')
         );
$function$;

-- Server-side predicate; no client role needs to call it directly.
revoke execute on function public.is_gas_cylinder(text, text) from public, anon;
grant execute on function public.is_gas_cylinder(text, text) to authenticated, portal_app;

-- Patch create_sale in place. Rewriting a ~500 line SECURITY DEFINER routine by
-- hand is how a working guard disappears; these are the four exact sites, and
-- the DO block fails loudly if any of them is not found.
do $$
declare
  d    text;
  hits integer;
begin
  d := pg_get_functiondef('public.create_sale(jsonb)'::regprocedure);

  hits := (select count(*) from regexp_matches(d, 'c\.code as category_code', 'g'));
  if hits <> 1 then
    raise exception 'create_sale patch: expected 1 category select, found %', hits;
  end if;
  d := replace(d, 'c.code as category_code', 'c.code as category_code, c.stock_model');

  hits := (select count(*) from regexp_matches(d, 'if v_variant\.category_code = ''LPG'' then', 'g'));
  if hits <> 1 then
    raise exception 'create_sale patch: expected 1 LPG branch, found %', hits;
  end if;
  d := replace(
    d,
    'if v_variant.category_code = ''LPG'' then',
    'if public.is_gas_cylinder(v_variant.category_code, v_variant.stock_model) then'
  );

  hits := (select count(*) from regexp_matches(d, 'and c\.code = ''LPG''', 'g'));
  if hits <> 2 then
    raise exception 'create_sale patch: expected 2 empty-return lookups, found %', hits;
  end if;
  d := replace(
    d,
    'and c.code = ''LPG''',
    'and public.is_gas_cylinder(c.code, c.stock_model)'
  );

  hits := (select count(*) from regexp_matches(d, 'elsif v_variant\.category_code = ''ACC'' then', 'g'));
  if hits <> 1 then
    raise exception 'create_sale patch: expected 1 accessory branch, found %', hits;
  end if;
  d := replace(
    d,
    'elsif v_variant.category_code = ''ACC'' then',
    'elsif v_variant.category_code in (''ACC'', ''ACCESSORIES'') then'
  );

  execute d;
end;
$$;

commit;
