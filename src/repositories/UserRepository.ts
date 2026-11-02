import type { Pool } from 'pg';
import type { UserView } from '../types.js';

interface UserRow {
  id: string;
  login: string;
  password_hash: string;
}

export interface UserCredentials extends UserView {
  passwordHash: string;
}

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findCredentialsByLogin(login: string): Promise<UserCredentials | null> {
    const result = await this.pool.query<UserRow>('SELECT id, login, password_hash FROM users WHERE login = $1', [login]);
    const row = result.rows[0];
    return row ? { id: row.id, login: row.login, passwordHash: row.password_hash } : null;
  }

  async findById(id: string): Promise<UserView | null> {
    const result = await this.pool.query<UserRow>('SELECT id, login FROM users WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? { id: row.id, login: row.login } : null;
  }
}
