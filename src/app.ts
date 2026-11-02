import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { AppError } from './errors.js';
import { PaymentSimulator } from './integrations/PaymentSimulator.js';
import { EventRepository } from './repositories/EventRepository.js';
import { PaymentAttemptRepository } from './repositories/PaymentAttemptRepository.js';
import { ReservationRepository } from './repositories/ReservationRepository.js';
import { UserRepository } from './repositories/UserRepository.js';
import { AuthService } from './services/AuthService.js';
import { TicketingService, type TicketingConfig } from './services/TicketingService.js';
import { SessionStore } from './sessions/SessionStore.js';
import type { PaymentScenario } from './types.js';

export interface AppConfig extends TicketingConfig {
  sessionTtlMinutes: number;
  cookieSecure: boolean;
  // Horloge des sessions : remplaçable dans les tests pour simuler une expiration.
  now?: () => number;
}

export const SESSION_COOKIE = 'sid';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildApp(pool: Pool, config: AppConfig) {
  const app = Fastify({ logger: true });
  app.register(cookie);

  const service = new TicketingService(
    new EventRepository(pool),
    new ReservationRepository(pool),
    new PaymentAttemptRepository(pool),
    new PaymentSimulator(config.paymentSlowMs),
    config,
  );
  const sessionTtlMs = config.sessionTtlMinutes * 60_000;
  const auth = new AuthService(new UserRepository(pool), new SessionStore(sessionTtlMs, config.now));
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
    maxAge: Math.floor(sessionTtlMs / 1000),
  };

  // Identité de la requête : uniquement la session reconnue côté serveur.
  const currentUser = (request: FastifyRequest) => auth.authenticate(request.cookies[SESSION_COOKIE]);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    app.log.error(error);
    return reply.code(503).send({ error: { code: 'TECHNICAL_FAILURE', message: 'Service momentanément indisponible.' } });
  });

  app.get('/health', async (_request, reply) => {
    await pool.query('SELECT 1');
    return reply.send({ status: 'ok' });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = asRecord(request.body);
    const login = typeof body.login === 'string' ? body.login.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const { user, sessionId } = await auth.login(login, password);
    auth.logout(request.cookies[SESSION_COOKIE]);
    return reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions).send({ user });
  });
  app.get('/api/auth/me', async request => ({ user: await currentUser(request) }));
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(request.cookies[SESSION_COOKIE]);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.get('/api/events', async () => ({ events: await service.listEvents() }));
  app.get<{ Params: { id: string } }>('/api/events/:id', async request => ({ event: await service.getEvent(request.params.id) }));
  app.post('/api/reservations', async (request, reply) => {
    const user = await currentUser(request);
    const body = asRecord(request.body);
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    return reply.code(201).send({ reservation: await service.reserve(eventId, user.id) });
  });
  app.get<{ Params: { id: string } }>('/api/reservations/:id', async request => {
    const user = await currentUser(request);
    return { reservation: await service.getReservation(request.params.id, user.id) };
  });
  app.post<{ Params: { id: string } }>('/api/reservations/:id/checkout', async request => {
    const user = await currentUser(request);
    const body = asRecord(request.body);
    const scenario = typeof body.scenario === 'string' ? body.scenario as PaymentScenario : 'success';
    return service.checkout(request.params.id, scenario, user.id);
  });

  for (const [route, file, type] of [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/app.css', 'app.css', 'text/css; charset=utf-8'],
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ]) {
    app.get(route, async (_request, reply) => {
      const body = await readFile(join(process.cwd(), 'public', file));
      return reply.type(type).send(body);
    });
  }
  return app;
}
