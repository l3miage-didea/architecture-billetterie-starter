export type EventStatus = 'OPEN' | 'CANCELLED';
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export type PaymentScenario = 'success' | 'failure' | 'slow';

export interface EventView {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  capacity: number;
  available: number;
  status: EventStatus;
}

export interface ReservationView {
  id: string;
  eventId: string;
  customerRef: string;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface UserView {
  id: string;
  login: string;
}

export interface PaymentAttemptView {
  id: string;
  reservationId: string;
  scenario: PaymentScenario;
  status: PaymentStatus;
  createdAt: string;
}
