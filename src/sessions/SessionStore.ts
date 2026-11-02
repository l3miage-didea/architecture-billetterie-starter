import { randomBytes } from 'node:crypto';

interface Session {
  userId: string;
  expiresAt: number;
}

// Sessions en mémoire : un seul processus. Un redémarrage déconnecte tous les utilisateurs.
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(userId: string): string {
    const id = randomBytes(32).toString('base64url');
    this.sessions.set(id, { userId, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  findUserId(id: string): string | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session.userId;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }
}
