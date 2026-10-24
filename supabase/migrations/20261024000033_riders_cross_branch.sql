-- Riders may deliver from any branch. Stock remains assigned to the sale's branch.
alter table public.riders alter column branch_id drop not null;

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.create_sale(jsonb)'::regprocedure);
  definition := replace(definition,
    'select r.is_active, r.branch_id into v_rider_active, v_rider_branch',
    'select r.is_active into v_rider_active');
  definition := replace(definition,
    'if v_rider_branch is null then',
    'if v_rider_active is null then');
  definition := replace(definition,
    E'    if v_rider_branch <> v_branch then\n      raise exception using message = ''rider_wrong_branch'', errcode = ''42501'';\n    end if;\n',
    '');
  execute definition;
end;
$$;
