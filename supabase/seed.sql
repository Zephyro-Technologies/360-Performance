-- Seed data: the category taxonomy and product-source vendors only. The catalogue starts
-- EMPTY by design — real products are entered through the dashboard and stocked via
-- purchase orders, which is what gives them a landed cost.
-- This file is the source of truth for the seed; edit it directly.

-- product-source vendors (distinct from the 3 PKR logistics vendor_accounts)
insert into suppliers (name, contact, country, currency) values
  ('FY MOTO', 'Jenny Qi', 'China', 'CNY'),
  ('Nanton Nanshen', 'Luke', 'China', 'CNY'),
  ('Chongqing', 'Mars Liu', 'China', 'CNY');

-- parent (navigation) categories
insert into categories (slug, name, sort_order) values
  ('exhaust-induction', 'Exhaust & Induction', 0),
  ('cooling-systems', 'Cooling', 1),
  ('fuel-plumbing', 'Fuel & Plumbing', 2),
  ('braking-suspension', 'Braking & Suspension', 3),
  ('electronics-lighting', 'Electronics & Lighting', 4),
  ('interior', 'Interior', 5),
  ('exterior', 'Exterior', 6);

-- leaf categories (products attach here, once added via the dashboard)
insert into categories (slug, name, sort_order, parent_id)
select v.slug, v.name, v.sort, p.id from (values
  ('downpipes', 'Downpipes', 10, 'exhaust-induction'),
  ('exhausts', 'Exhausts', 11, 'exhaust-induction'),
  ('intakes', 'Intakes', 12, 'exhaust-induction'),
  ('intercooler-heat-exchangers', 'Intercooler + Heat Exchangers', 13, 'cooling-systems'),
  ('ngk-plugs-and-coils', 'NGK Plugs and Coils', 14, 'electronics-lighting'),
  ('brake-pads', 'Brake Pads', 15, 'braking-suspension'),
  ('cooling-products', 'Cooling Products', 16, 'cooling-systems'),
  ('taillights', 'Taillights', 17, 'electronics-lighting'),
  ('carbon-steering-wheels', 'Carbon Steering Wheels', 18, 'interior'),
  ('headlights', 'Headlights', 19, 'electronics-lighting'),
  ('exhaust-manifold', 'Exhaust Manifold', 20, 'exhaust-induction'),
  ('an-pipe', 'AN Pipe', 21, 'fuel-plumbing'),
  ('suspension', 'Suspension', 22, 'braking-suspension'),
  ('fueling', 'Fueling', 23, 'fuel-plumbing'),
  ('an-fittings', 'AN Fittings', 24, 'fuel-plumbing'),
  ('gauges', 'Gauges', 25, 'electronics-lighting'),
  ('misc-performance', 'Misc Performance', 27, null),
  ('body-kits', 'Body Kits', 28, 'exterior'),
  ('android-carplay', 'Android Carplay', 29, 'electronics-lighting'),
  ('ambient-lighting', 'Ambient Lighting', 30, 'electronics-lighting'),
  ('intake-manifolds', 'Intake Manifolds', 31, 'exhaust-induction'),
  ('aluminum-radiators', 'Aluminum Radiators', 32, 'cooling-systems'),
  ('seats', 'Seats', 33, 'interior'),
  ('carbon-accessories', 'Carbon Accessories', 34, 'interior'),
  ('misc-exterior', 'Misc Exterior', 35, 'exterior'),
  ('misc-interior', 'Misc Interior', 36, 'interior')
) as v(slug, name, sort, parent_slug)
left join categories p on p.slug = v.parent_slug;

-- products: none yet — entered via the dashboard, then stocked via Purchase
-- Orders -> receipt (creating cost-bearing batches). No mock catalogue.
