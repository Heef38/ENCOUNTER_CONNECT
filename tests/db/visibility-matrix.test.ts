/**
 * The full grid (rethink §7.10): every kind of viewer against every kind
 * of gathering, through the same RLS path the app reads with. The expected
 * table is written out by hand, so it documents the rules and a change to
 * ec_can_see_event that moves any cell fails here.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb, as } from './harness.ts';
import { seedWorld, type World } from './fixtures.ts';

let db: PGlite;
let w: World;

before(async () => {
  db = await freshDb();
  w = await seedWorld(db);
});

type Viewer = 'admin' | 'campusAdmin' | 'connector' | 'host' | 'member' | 'ringMember' | 'nonMember' | 'newcomer' | 'visitor';
type Gathering = keyof World['events'];

const ALL: Viewer[] = ['admin', 'campusAdmin', 'connector', 'host', 'member', 'ringMember', 'nonMember', 'newcomer', 'visitor'];
const STAFF: Viewer[] = ['admin', 'campusAdmin', 'connector'];
const GRACE: Viewer[] = ALL.filter((v) => v !== 'visitor');

/** Who sees each gathering. */
const EXPECTED: Record<Gathering, Viewer[]> = {
  // Public and published, or public and cancelled: everyone, any church.
  publicCampus: ALL,
  cancelledPublic: ALL,
  otherChurchPublic: ALL,
  // Private, aimed at Women's Ministry: its members, the host, and staff.
  // The parent ring (Women) does not see it without the eligibility ring.
  girlsNight: [...STAFF, 'host', 'member'],
  // Private to the whole church: everyone at Grace, nobody elsewhere.
  churchWide: GRACE,
  // Private, one person invited.
  inviteOnly: [...STAFF, 'host', 'nonMember'],
  // Not real yet, or pulled for review: the host and staff only.
  draft: [...STAFF, 'host'],
  hidden: [...STAFF, 'host'],
};

test('every viewer sees exactly the gatherings the rules give them', async () => {
  const failures: string[] = [];
  for (const viewer of ALL) {
    const seen = new Set(
      (await as(db, w[viewer], (tx) => tx.query<{ id: string }>(`SELECT id FROM events`))).rows.map((r) => r.id),
    );
    for (const [gathering, id] of Object.entries(w.events) as Array<[Gathering, string]>) {
      const should = EXPECTED[gathering].includes(viewer);
      if (seen.has(id) !== should) failures.push(`${viewer} ${should ? 'should' : 'should not'} see ${gathering}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('a held home address reaches only the host, admins, and members who said going', async () => {
  const e = w.events.girlsNight;
  await db.query(`INSERT INTO event_addresses (event_id, address_line1, postal_code) VALUES ($1, '12 Maple St', '79701') ON CONFLICT (event_id) DO NOTHING`, [e]);
  await db.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [e, w.member.id]);
  await db.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'maybe')`, [e, w.ringMember.id]);

  const canRead: Viewer[] = ['admin', 'campusAdmin', 'host', 'member'];
  const failures: string[] = [];
  for (const viewer of ALL) {
    const rows = (await as(db, w[viewer], (tx) => tx.query(`SELECT address_line1 FROM event_addresses WHERE event_id = $1`, [e]))).rows;
    const should = canRead.includes(viewer);
    if ((rows.length === 1) !== should) failures.push(`${viewer} ${should ? 'should' : 'should not'} read the address`);
  }
  assert.deepEqual(failures, [], 'connectors, "maybe", other members and other churches never get a home address');
});

test('nobody outside the church reads its rosters, people or contact notes', async () => {
  const tables = ['participants', 'participant_touches', 'church_invites', 'notification_outbox'];
  for (const table of tables) {
    const rows = (await as(db, w.visitor, (tx) => tx.query(`SELECT 1 FROM ${table} WHERE church_id = $1`, [w.grace.id]))).rows;
    assert.equal(rows.length, 0, `${table} is closed to another church`);
  }
  const roster = (await as(db, w.visitor, (tx) => tx.query(`SELECT * FROM ec_group_roster($1)`, [w.groups.women]))).rows;
  assert.equal(roster.length, 0, 'another church gets no roster');
});
