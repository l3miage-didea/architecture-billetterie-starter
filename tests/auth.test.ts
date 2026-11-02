import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Pool } from 'pg';
import { buildApp, SESSION_COOKIE } from '../src/app.js';
import { ALICE, BOB, baseConfig, loginAs } from './helpers.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Horloge contrôlable : permet de tester l'expiration de session sans attendre 30 minutes.
let clock = Date.now();
const app = buildApp(pool, { ...baseConfig, now: () => clock });

before(async () => { await app.ready(); });
beforeEach(async () => {
  clock = Date.now();
  await pool.query('TRUNCATE payment_attempts, reservations');
});
after(async () => { await app.close(); await pool.end(); });

async function count(table: 'reservations' | 'payment_attempts'): Promise<number> {
  const result = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM ${table}`);
  return result.rows[0].total;
}

async function aliceReservation(cookies: Record<string, string>): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/reservations', cookies, payload: { eventId: 'festival-lumieres' } });
  assert.equal(created.statusCode, 201);
  return created.json().reservation.id;
}

test('un visiteur non connecté consulte le catalogue', async () => {
  const list = await app.inject({ method: 'GET', url: '/api/events' });
  assert.equal(list.statusCode, 200);
  const detail = await app.inject({ method: 'GET', url: '/api/events/festival-lumieres' });
  assert.equal(detail.statusCode, 200);
});

test('un visiteur non connecté ne peut ni réserver ni payer', async () => {
  const reserve = await app.inject({ method: 'POST', url: '/api/reservations', payload: { eventId: 'festival-lumieres', customerRef: ALICE.id } });
  assert.equal(reserve.statusCode, 401);
  assert.equal(reserve.json().error.code, 'AUTH_REQUIRED');

  const id = await aliceReservation(await loginAs(app, ALICE));
  const checkout = await app.inject({ method: 'POST', url: `/api/reservations/${id}/checkout`, payload: { scenario: 'success' } });
  assert.equal(checkout.statusCode, 401);
  assert.equal(checkout.json().error.code, 'AUTH_REQUIRED');
  const state = await app.inject({ method: 'GET', url: `/api/reservations/${id}` });
  assert.equal(state.statusCode, 401);

  assert.equal(await count('reservations'), 1, 'seule la réservation d’Alice existe');
  assert.equal(await count('payment_attempts'), 0);
});

test('un mauvais mot de passe est refusé sans créer de session', async () => {
  const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'alice', password: 'mauvais' } });
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.json().error.code, 'INVALID_CREDENTIALS');
  assert.equal(wrong.cookies.length, 0);
  const unknown = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'inconnu', password: 'x' } });
  assert.equal(unknown.statusCode, 401);
  assert.equal(unknown.json().error.code, 'INVALID_CREDENTIALS');
});

test('la connexion renvoie un cookie de session protégé et aucune donnée secrète', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: ALICE.login, password: ALICE.password } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user: { id: ALICE.id, login: 'alice' } });
  assert.doesNotMatch(response.body, /password|hash|scrypt/i);
  const session = response.cookies.find(cookie => cookie.name === SESSION_COOKIE);
  assert.ok(session);
  assert.notEqual(session.value, ALICE.id, 'le cookie ne contient pas l’identifiant utilisateur');
  assert.equal(session.httpOnly, true);
  assert.equal(session.sameSite, 'Lax');
  assert.equal(session.path, '/');

  const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: session.value } });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json(), { user: { id: ALICE.id, login: 'alice' } });
});

test('Alice se connecte, réserve et paie avec succès', async () => {
  const alice = await loginAs(app, ALICE);
  const id = await aliceReservation(alice);
  const paid = await app.inject({ method: 'POST', url: `/api/reservations/${id}/checkout`, cookies: alice, payload: { scenario: 'success' } });
  assert.equal(paid.statusCode, 200);
  assert.equal(paid.json().reservation.customerRef, ALICE.id);
  assert.equal(paid.json().reservation.status, 'CONFIRMED');
  assert.equal(paid.json().paymentAttempt.status, 'SUCCEEDED');
});

test('un auteur envoyé dans le corps ne remplace pas l’utilisateur connecté', async () => {
  const alice = await loginAs(app, ALICE);
  const created = await app.inject({
    method: 'POST', url: '/api/reservations', cookies: alice,
    payload: { eventId: 'festival-lumieres', customerRef: BOB.id, userId: BOB.id },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().reservation.customerRef, ALICE.id);
  const stored = await pool.query('SELECT customer_ref FROM reservations WHERE id = $1', [created.json().reservation.id]);
  assert.equal(stored.rows[0].customer_ref, ALICE.id);
});

test('Bob ne peut ni consulter ni payer la réservation d’Alice', async () => {
  const id = await aliceReservation(await loginAs(app, ALICE));
  const bob = await loginAs(app, BOB);

  const state = await app.inject({ method: 'GET', url: `/api/reservations/${id}`, cookies: bob });
  assert.equal(state.statusCode, 403);
  assert.equal(state.json().error.code, 'RESERVATION_FORBIDDEN');

  const checkout = await app.inject({ method: 'POST', url: `/api/reservations/${id}/checkout`, cookies: bob, payload: { scenario: 'success' } });
  assert.equal(checkout.statusCode, 403);
  assert.equal(checkout.json().error.code, 'RESERVATION_FORBIDDEN');

  const stored = await pool.query('SELECT status FROM reservations WHERE id = $1', [id]);
  assert.equal(stored.rows[0].status, 'PENDING');
  assert.equal(await count('payment_attempts'), 0);
});

test('un cookie absent, modifié ou expiré est refusé', async () => {
  const absent = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(absent.statusCode, 401);
  assert.equal(absent.json().error.code, 'AUTH_REQUIRED');

  const alice = await loginAs(app, ALICE);
  const altered = { [SESSION_COOKIE]: `${alice[SESSION_COOKIE]}x` };
  const modified = await app.inject({ method: 'POST', url: '/api/reservations', cookies: altered, payload: { eventId: 'festival-lumieres' } });
  assert.equal(modified.statusCode, 401);
  assert.equal(modified.json().error.code, 'AUTH_REQUIRED');

  const forged = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: ALICE.id } });
  assert.equal(forged.statusCode, 401, 'un identifiant utilisateur ne sert pas de session');

  clock += 31 * 60_000;
  const expired = await app.inject({ method: 'POST', url: '/api/reservations', cookies: alice, payload: { eventId: 'festival-lumieres' } });
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.json().error.code, 'AUTH_REQUIRED');
  assert.equal(await count('reservations'), 0);
});

test('après déconnexion, l’ancien cookie ne fonctionne plus', async () => {
  const alice = await loginAs(app, ALICE);
  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: alice });
  assert.equal(logout.statusCode, 204);
  const cleared = logout.cookies.find(cookie => cookie.name === SESSION_COOKIE);
  assert.ok(cleared && cleared.value === '', 'le cookie est retiré');

  const reuse = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: alice });
  assert.equal(reuse.statusCode, 401);
  assert.equal(reuse.json().error.code, 'AUTH_REQUIRED');
});

test('les sessions d’Alice et de Bob sont distinctes', async () => {
  const alice = await loginAs(app, ALICE);
  const bob = await loginAs(app, BOB);
  assert.notEqual(alice[SESSION_COOKIE], bob[SESSION_COOKIE]);
  const meBob = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob });
  assert.equal(meBob.json().user.login, 'bob');
});
