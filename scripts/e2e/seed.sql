-- E2E fixture: 4 courts, 4 players and the club admin (run after the migrations, local DB only)
insert into terrains (name, type, description) values
  ('Court Central', 'indoor', 'Panoramic glass'), ('Court 2', 'indoor', null),
  ('Court 3', 'outdoor', null), ('Court 4', 'outdoor', null);
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'yasmine@test.tn', '{"first_name":"Yasmine","last_name":"Ben Ali"}'),
  ('22222222-2222-2222-2222-222222222222', 'karim@test.tn', '{"first_name":"Karim","last_name":"Belhadj"}'),
  ('33333333-3333-3333-3333-333333333333', 'ines@test.tn', '{"first_name":"Ines","last_name":"Tlili"}'),
  ('44444444-4444-4444-4444-444444444444', 'admin@club.tn', '{"first_name":"Club","last_name":"Owner"}'),
  ('55555555-5555-5555-5555-555555555555', 'dalia@test.tn', '{"first_name":"Dalia","last_name":"Haddad"}');
update users set role = 'admin' where email = 'admin@club.tn';
