-- DRAFT PRICING. Nothing was priced - 0 of 69 variants had a list price, and
-- sale_lines enforces list_price > 0, so no sale could be created at all.
--
-- LPG is derived from cylinder size at roughly KSh 170/kg rounded to the
-- nearest 50, which reproduces the market bands researched earlier: 6 kg about
-- 1,000; 13 kg about 2,200; 35 kg about 5,950; 50 kg about 8,500.
-- list_price is the REFILL price. A new cylinder is priced above it on the
-- line, which the floor rules permit without an override.
--
-- min_price is set to 88% of list rounded down to 50. It is a floor, not a
-- target, and it is what makes the discount guard-rails enforceable at all -
-- with no floor the RPC refuses to discount a variant whatsoever.
--
-- Water and accessory prices are hand-set guesses and need checking.

update public.product_variants v
   set list_price_ksh = round(v.size_kg * 170 / 50) * 50,
       min_price      = floor((round(v.size_kg * 170 / 50) * 50) * 0.88 / 50) * 50,
       max_discount_percent = 10
  from public.categories c
 where c.id = v.category_id
   and c.name ilike '%LPG%'
   and v.size_kg is not null;

update public.product_variants
   set list_price_ksh = case
         when product_variants.name ilike '%500 ml%' then 50
         when product_variants.name ilike '%1 litre%' then 100
         when product_variants.name ilike '%5 litre%' then 250
         when product_variants.name ilike '%10 litre%' then 450
         when product_variants.name ilike '%20 litre%' then 800
         else 600
       end,
       min_price = case
         when product_variants.name ilike '%500 ml%' then 45
         when product_variants.name ilike '%1 litre%' then 90
         when product_variants.name ilike '%5 litre%' then 220
         when product_variants.name ilike '%10 litre%' then 400
         when product_variants.name ilike '%20 litre%' then 720
         else 540
       end,
       max_discount_percent = 10
  from public.categories c
 where c.id = product_variants.category_id
   and c.name ilike '%water%';

update public.product_variants
   set list_price_ksh = case
         when product_variants.name ilike '%high pressure%' then 2500
         when product_variants.name ilike '%regulator%' then 1200
         when product_variants.name ilike '%pipe%' then 300
         when product_variants.name ilike '%clip%' then 400
         else 1500
       end,
       min_price = case
         when product_variants.name ilike '%high pressure%' then 2200
         when product_variants.name ilike '%regulator%' then 1050
         when product_variants.name ilike '%pipe%' then 270
         when product_variants.name ilike '%clip%' then 350
         else 1350
       end,
       max_discount_percent = 5
  from public.categories c
 where c.id = product_variants.category_id
   and c.name ilike '%accessor%';
