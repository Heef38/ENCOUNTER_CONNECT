/**
 * Database test harness: the real migrations, run in PGlite (Postgres
 * compiled to WebAssembly), so row-level security can be tested without
 * Docker or a hosted project.
 *
 * Every test file gets its own in-memory database cloned from one migrated
 * snapshot, so files can't interfere with each other and the migrations
 * only run once per process.
 *
 *   const db = await freshDb();
 *   const church = await seedChurch(db, 'Grace');
 *   const ana = await seedUser(db, { church, role: 'participant' });
 *   const rows = await asUser(db, ana, (tx) => tx.query('select * from profiles'));
 */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

let snapshot: Promise<Blob> | null = null;

async function buildSnapshot(): Promise<Blob> {
  const db = new PGlite();
  await db.exec(readFileSync(join(ROOT, 'tests', 'db', 'supabase-shim.sql'), 'utf8'));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
  const dump = await db.dumpDataDir('none');
  await db.close();
  return dump;
}

/**
 * The privileges a hosted project created before the Data API default changed
 * still has: everything in public granted to the API roles, with RLS as the
 * only guard. Tests that reproduce production behavior opt into this.
 */
export const LEGACY_GRANTS = `
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
`;

export async function freshDb(opts: { legacyGrants?: boolean } = {}): Promise<PGlite> {
  snapshot ??= buildSnapshot();
  const db = new PGlite({ loadDataDir: await snapshot });
  if (opts.legacyGrants) await db.exec(LEGACY_GRANTS);
  return db;
}

// ── Seeding (runs as the postgres superuser, bypassing RLS) ─────

export interface SeededChurch {
  id: string;
  name: string;
  campusId: string;
}

export async function seedChurch(db: PGlite, name: string): Promise<SeededChurch> {
  const id = randomUUID();
  const campusId = randomUUID();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await db.query(`INSERT INTO churches (id, name, slug) VALUES ($1, $2, $3)`, [id, name, slug]);
  await db.query(
    `INSERT INTO campuses (id, church_id, name, slug) VALUES ($1, $2, $3, 'main')`,
    [campusId, id, `${name} Main`],
  );
  return { id, name, campusId };
}

export type EcRole = 'church_admin' | 'campus_admin' | 'connector' | 'participant';

export interface SeededUser {
  id: string;
  churchId: string | null;
  role: EcRole;
}

export async function seedUser(
  db: PGlite,
  opts: {
    church: SeededChurch | null;
    role?: EcRole;
    platformAdmin?: boolean;
    firstName?: string;
    participantStatus?: string | null;
  },
): Promise<SeededUser> {
  const id = randomUUID();
  const role = opts.role ?? 'participant';
  const first = opts.firstName ?? role;
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@test.local`]);
  await db.query(
    `INSERT INTO profiles (id, role, church_id, campus_id, first_name, last_name, email, is_platform_admin)
     VALUES ($1, $2, $3, $4, $5, 'Test', $6, $7)`,
    [
      id,
      role,
      opts.church?.id ?? null,
      opts.church?.campusId ?? null,
      first,
      `${id}@test.local`,
      opts.platformAdmin ?? false,
    ],
  );
  if (opts.participantStatus && opts.church) {
    await db.query(
      `INSERT INTO participants (church_id, campus_id, profile_id, first_name, last_name, email, status)
       VALUES ($1, $2, $3, $4, 'Test', $5, $6)`,
      [opts.church.id, opts.church.campusId, id, first, `${id}@test.local`, opts.participantStatus],
    );
  }
  return { id, churchId: opts.church?.id ?? null, role };
}

// ── Acting as someone (RLS applies) ─────────────────────────────

type Who = SeededUser | 'anon' | 'service';

/**
 * Runs `fn` inside a transaction as the given caller, the way PostgREST
 * would: SET ROLE to the API role and publish the JWT claims. The
 * transaction is always rolled back, so a test can attempt writes without
 * leaking state into the next assertion. Errors propagate.
 */
export async function as<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined;
  let failure: unknown = null;
  await db.transaction(async (tx) => {
    const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
    const claims =
      who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' } : { sub: who.id, role: 'authenticated' };
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    try {
      result = await fn(tx);
    } catch (err) {
      failure = err;
    }
    await tx.rollback();
  });
  if (failure) throw failure;
  return result as T;
}

/** Like `as`, but commits — for setup steps that must go through RLS. */
export async function asCommit<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
    const claims =
      who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' } : { sub: who.id, role: 'authenticated' };
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return fn(tx);
  });
}

/**
 * True when a write was refused: it raised, or RLS let it touch no rows.
 * The statement must use RETURNING so the row count is visible.
 */
export async function refused(p: Promise<{ rows: unknown[] }>): Promise<boolean> {
  try {
    const r = await p;
    return r.rows.length === 0;
  } catch {
    return true;
  }
}

/** Resolves to the error message when `p` rejects, or null when it succeeds. */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
