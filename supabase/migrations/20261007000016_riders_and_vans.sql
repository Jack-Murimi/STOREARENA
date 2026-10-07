-- Rider vans are stock-holding locations, so each rider gets one, then the
-- rider row points at it. Branch assignment is a placeholder - Romano on
-- Jamhuri, Sospeter on Kileleshwa, Jose on Lavington - and the phone numbers
-- are placeholders too, because none were supplied. Both need correcting.
-- stock_locations already enforces van_needs_branch_and_rider, so a VAN must
-- carry both home_location_id (its branch) and the rider text column.
insert into public.stock_locations (id, code, name, kind, home_location_id, rider, active)
values
  ('van-rom', 'VAN-ROM', 'Romano Sifuna''s van', 'VAN', 'loc-jam', 'Romano Sifuna', true),
  ('van-sos', 'VAN-SOS', 'Sospeter''s van',      'VAN', 'loc-kil', 'Sospeter',      true),
  ('van-jos', 'VAN-JOS', 'Jose''s van',          'VAN', 'loc-lav', 'Jose',          true)
on conflict (id) do update
  set name = excluded.name, kind = excluded.kind,
      home_location_id = excluded.home_location_id, rider = excluded.rider,
      active = excluded.active;

insert into public.riders (id, name, phone, branch_id, stock_location_id, is_active)
values
  ('rdr-rom', 'Romano Sifuna', '0700 000 001', 'loc-jam', 'van-rom', true),
  ('rdr-sos', 'Sospeter',      '0700 000 002', 'loc-kil', 'van-sos', true),
  ('rdr-jos', 'Jose',          '0700 000 003', 'loc-lav', 'van-jos', true)
on conflict (id) do update
  set name = excluded.name, branch_id = excluded.branch_id,
      stock_location_id = excluded.stock_location_id, is_active = excluded.is_active;
