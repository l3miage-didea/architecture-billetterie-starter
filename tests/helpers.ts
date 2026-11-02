import assert from 'node:assert/strict';
import type { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/app.js';

type App = ReturnType<typeof buildApp>;

export const ALICE = { id: '00000000-0000-4000-8000-00000000a11c', login: 'alice', password: 'alice-demo' };
export const BOB = { id: '00000000-0000-4000-8000-000000000b0b', login: 'bob', password: 'bob-demo' };

export const baseConfig = { reservationTtlMinutes: 15, paymentSlowMs: 1, reservationHoldMs: 0, sessionTtlMinutes: 30, cookieSecure: false };

// Connexion par la vraie route : renvoie les cookies à joindre aux requêtes suivantes.
export async function loginAs(app: App, user: { login: string; password: string }): Promise<Record<string, string>> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: user.login, password: user.password } });
  assert.equal(response.statusCode, 200, `connexion de ${user.login} refusée`);
  const session = response.cookies.find(cookie => cookie.name === SESSION_COOKIE);
  assert.ok(session, 'aucun cookie de session reçu');
  return { [SESSION_COOKIE]: session.value };
}
