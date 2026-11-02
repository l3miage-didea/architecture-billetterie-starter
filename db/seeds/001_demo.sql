INSERT INTO events (id, title, venue, starts_at, capacity, status) VALUES
  ('festival-lumieres', 'Festival des Lumières', 'Halle des Arts', '2027-04-17 20:00:00+02', 120, 'OPEN'),
  ('concert-jazz', 'Soirée jazz', 'Le Forum', '2027-05-08 21:00:00+02', 60, 'OPEN'),
  ('atelier-une-place', 'Dernière place — scénario atelier', 'Studio 3', '2027-06-12 18:30:00+02', 1, 'OPEN'),
  ('concert-annule', 'Concert annulé — scénario atelier', 'Le Forum', '2027-07-03 20:00:00+02', 40, 'CANCELLED')
ON CONFLICT (id) DO NOTHING;
