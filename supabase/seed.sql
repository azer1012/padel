insert into public.terrains (name, description, type, price_per_person)
values
  ('Court Indoor 1', 'Primary indoor padel court', 'indoor', 25),
  ('Court Outdoor 1', 'Outdoor padel court', 'outdoor', 25)
on conflict do nothing;

