import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { hashPassword } from './security/passwords.js';

// Comptes fictifs documentés dans le README. Les mots de passe ne servent qu'à la démonstration.
const demoUsers = [
  { id: '00000000-0000-4000-8000-00000000a11c', login: 'alice', password: 'alice-demo' },
  { id: '00000000-0000-4000-8000-000000000b0b', login: 'bob', password: 'bob-demo' },
];

const migrations = ['001_init.sql', '002_users.sql'];
const seeds = ['001_demo.sql'];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const file of migrations) {
    await pool.query(await readFile(join(process.cwd(), 'db', 'migrations', file), 'utf8'));
  }
  for (const file of seeds) {
    await pool.query(await readFile(join(process.cwd(), 'db', 'seeds', file), 'utf8'));
  }
  for (const user of demoUsers) {
    await pool.query(
      'INSERT INTO users (id, login, password_hash) VALUES ($1, $2, $3) ON CONFLICT (login) DO NOTHING',
      [user.id, user.login, await hashPassword(user.password)],
    );
  }
  console.log('Migrations, données fictives et comptes de démonstration prêts.');
} finally {
  await pool.end();
}
