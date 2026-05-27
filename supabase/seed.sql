insert into public.terrains (name, description, type, price_per_person, capacity)
values
  ('Court Indoor 1', 'Primary indoor padel court', 'indoor', 25, 4),
  ('Court Outdoor 1', 'Outdoor padel court', 'outdoor', 25, 4)
on conflict do nothing;

