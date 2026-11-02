import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from '../errors.js';
import { PaymentSimulator } from '../integrations/PaymentSimulator.js';
import { EventRepository } from '../repositories/EventRepository.js';
import { PaymentAttemptRepository } from '../repositories/PaymentAttemptRepository.js';
import { ReservationRepository } from '../repositories/ReservationRepository.js';
import type { EventView, PaymentAttemptView, PaymentScenario, ReservationView } from '../types.js';

export interface TicketingConfig {
  reservationTtlMinutes: number;
  paymentSlowMs: number;
  reservationHoldMs: number;
}

export class TicketingService {
  constructor(
    private readonly events: EventRepository,
    private readonly reservations: ReservationRepository,
    private readonly paymentAttempts: PaymentAttemptRepository,
    private readonly payment: PaymentSimulator,
    private readonly config: TicketingConfig,
  ) {}

  private validateReservationId(id: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new AppError(400, 'INVALID_INPUT', 'Identifiant de réservation invalide.');
    }
  }

  async listEvents(): Promise<EventView[]> {
    await this.reservations.expirePending();
    return this.events.list();
  }

  async getEvent(id: string): Promise<EventView> {
    await this.reservations.expirePending();
    const event = await this.events.find(id);
    if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.');
    return event;
  }

  // Une réservation appartient à l'utilisateur dont l'identifiant est enregistré dans customerRef.
  private ensureOwner(reservation: ReservationView, userId: string): void {
    if (reservation.customerRef !== userId) {
      throw new AppError(403, 'RESERVATION_FORBIDDEN', 'Cette réservation appartient à un autre compte.');
    }
  }

  // userId vient de la session vérifiée par la route, jamais du corps de la requête.
  async reserve(eventId: string, userId: string): Promise<ReservationView> {
    if (!eventId.trim()) {
      throw new AppError(400, 'INVALID_INPUT', 'Indiquez un événement.');
    }
    await this.reservations.expirePending();
    const event = await this.events.find(eventId);
    if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'Événement introuvable.');
    if (event.status === 'CANCELLED') throw new AppError(409, 'EVENT_CANCELLED', 'Cet événement est annulé : aucune nouvelle réservation n’est acceptée.');
    if (event.available <= 0) throw new AppError(409, 'SOLD_OUT', 'Il ne reste plus de place.');
    if (this.config.reservationHoldMs > 0) await sleep(this.config.reservationHoldMs);
    const expiresAt = new Date(Date.now() + this.config.reservationTtlMinutes * 60_000);
    return this.reservations.create(randomUUID(), eventId, userId, expiresAt);
  }

  async getReservation(id: string, userId: string): Promise<ReservationView & { paymentAttempts: PaymentAttemptView[] }> {
    this.validateReservationId(id);
    await this.reservations.expirePending();
    const reservation = await this.reservations.find(id);
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Réservation introuvable.');
    this.ensureOwner(reservation, userId);
    return { ...reservation, paymentAttempts: await this.paymentAttempts.listForReservation(id) };
  }

  async checkout(id: string, scenario: PaymentScenario, userId: string): Promise<{ reservation: ReservationView; paymentAttempt: PaymentAttemptView }> {
    this.validateReservationId(id);
    if (!['success', 'failure', 'slow'].includes(scenario)) {
      throw new AppError(400, 'INVALID_INPUT', 'Scénario de paiement invalide.');
    }
    await this.reservations.expirePending();
    const reservation = await this.reservations.find(id);
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Réservation introuvable.');
    // Refus d'achat vérifié avant toute tentative : aucun paiement n'est créé ni simulé.
    this.ensureOwner(reservation, userId);
    if (reservation.status === 'EXPIRED') throw new AppError(410, 'RESERVATION_EXPIRED', 'La réservation a expiré.');
    if (reservation.status !== 'PENDING') throw new AppError(409, 'RESERVATION_CLOSED', 'La réservation ne peut plus être payée.');

    let attempt = await this.paymentAttempts.create(randomUUID(), id, scenario);
    const result = await this.payment.run(scenario);
    if (result === 'SUCCEEDED') {
      attempt = await this.paymentAttempts.changeStatus(attempt.id, 'SUCCEEDED');
      return { reservation: await this.reservations.changeStatus(id, 'CONFIRMED'), paymentAttempt: attempt };
    }
    if (result === 'FAILED') {
      attempt = await this.paymentAttempts.changeStatus(attempt.id, 'FAILED');
      return { reservation: await this.reservations.changeStatus(id, 'FAILED'), paymentAttempt: attempt };
    }
    return { reservation, paymentAttempt: attempt };
  }
}
