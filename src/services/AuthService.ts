import { AppError } from '../errors.js';
import type { UserRepository } from '../repositories/UserRepository.js';
import { verifyPassword } from '../security/passwords.js';
import type { SessionStore } from '../sessions/SessionStore.js';
import type { UserView } from '../types.js';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
  ) {}

  async login(login: string, password: string): Promise<{ user: UserView; sessionId: string }> {
    const credentials = login ? await this.users.findCredentialsByLogin(login) : null;
    if (!credentials || !(await verifyPassword(password, credentials.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
    }
    const user = { id: credentials.id, login: credentials.login };
    return { user, sessionId: this.sessions.create(user.id) };
  }

  async authenticate(sessionId: string | undefined): Promise<UserView> {
    const userId = sessionId ? this.sessions.findUserId(sessionId) : null;
    const user = userId ? await this.users.findById(userId) : null;
    if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Connectez-vous pour continuer.');
    return user;
  }

  logout(sessionId: string | undefined): void {
    if (sessionId) this.sessions.delete(sessionId);
  }
}
