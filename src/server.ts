import { Pool } from 'pg';
import { buildApp } from './app.js';

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(pool, {
  reservationTtlMinutes: numberFromEnv('RESERVATION_TTL_MINUTES', 15),
  paymentSlowMs: numberFromEnv('PAYMENT_SLOW_MS', 2000),
  reservationHoldMs: numberFromEnv('LAB_RESERVATION_PAUSE_MS', 75),
  sessionTtlMinutes: numberFromEnv('SESSION_TTL_MINUTES', 30),
  // Démonstration locale en HTTP : activer COOKIE_SECURE=true derrière HTTPS.
  cookieSecure: process.env.COOKIE_SECURE === 'true',
});

async function stop() {
  await app.close();
  await pool.end();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) }).catch(async error => {
  app.log.error(error);
  await stop();
  process.exitCode = 1;
});
