import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { buildApp } from '../src/app.js';
import { ALICE, BOB, baseConfig, loginAs } from './helpers.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(pool, { ...baseConfig, reservationHoldMs: 120 });
let sessions: Record<string, string>[] = [];
before(async () => {
  await app.ready();
  await pool.query('TRUNCATE payment_attempts, reservations');
  sessions = [await loginAs(app, ALICE), await loginAs(app, BOB)];
});
after(async () => { await app.close(); await pool.end(); });

test('une seule demande doit occuper la dernière place', async () => {
  const requests = sessions.map(cookies => app.inject({
    method: 'POST', url: '/api/reservations', cookies,
    payload: { eventId: 'atelier-une-place' },
  }));
  const responses = await Promise.all(requests);
  const accepted = responses.filter(response => response.statusCode === 201).length;
  const result = await pool.query<{ active: number }>(
    "SELECT count(*)::int AS active FROM reservations WHERE event_id = 'atelier-une-place' AND status IN ('PENDING','CONFIRMED')",
  );
  assert.ok(result.rows[0].active <= 1, `Deux demandes ont été acceptées (${accepted}) pour une seule place.`);
});
