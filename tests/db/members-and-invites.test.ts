/**
 * Church #2 readiness (migration 035): members are not newcomers, a
 * member's standing comes from an admin's confirmation, and invites hold
 * no secret and belong to one church.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb, as, errorOf, refused, seedUser, type SeededUser } from './harness.ts';
import { seedWorld, type World } from './fixtures.ts';

let db: PGlite;
let w: World;
let otherAdmin: SeededUser;
let claimed: SeededUser;
let claimedPid: string;

before(async () => {
  db = await freshDb();
  w = await seedWorld(db);
  otherAdmin = await seedUser(db, { church: w.other, role: 'church_admin', firstName: 'Otto' });
  // Someone who signed up saying "I already belong to this church".
  claimed = await seedUser(db, { church: w.grace, firstName: 'Mo', participantStatus: 'new' });
  claimedPid = (await db.query<{ id: string }>(`SELECT id FROM participants WHERE profile_id = $1`, [claimed.id])).rows[0].id;
  await db.query(
    `UPDATE participants SET joined_as = 'member', signed_up_at = now() - interval '40 days' WHERE id = $1`,
    [claimedPid],
  );
});

const stage = async (pid: string) =>
  (await as(db, w.admin, (tx) =>
    tx.query<{ stage: string; flags: string[] }>(
      `SELECT stage, flags FROM ec_connect_pipeline($1) WHERE participant_id = $2`,
      [w.grace.id, pid],
    ),
  )).rows[0];

const canHost = async (who: SeededUser) =>
  (await as(db, who, (tx) => tx.query<{ ok: boolean }>(`SELECT ec_can_host_events() AS ok`))).rows[0].ok;

test('a member who says they belong is not counted as new, and waits for an admin', async () => {
  const s = await stage(claimedPid);
  assert.equal(s.stage, 'member');
  assert.deepEqual(s.flags, ['confirm_member'], 'only the confirm flag; no newcomer nudges for a member');
});

test('only an admin of the church confirms a member, and signs it themselves', async () => {
  const confirmAs = (who: SeededUser, signer: string) =>
    as(db, who, (tx) =>
      tx.query(
        `UPDATE participants SET member_confirmed_at = now(), member_confirmed_by = $2 WHERE id = $1 RETURNING id`,
        [claimedPid, signer],
      ),
    );
  assert.ok(await refused(confirmAs(w.connector, w.connector.id)), 'a connector cannot confirm');
  assert.ok(await refused(confirmAs(claimed, claimed.id)), 'the person cannot confirm themselves');
  assert.ok(await refused(confirmAs(otherAdmin, otherAdmin.id)), 'another church’s admin cannot');
  assert.ok(await refused(confirmAs(w.campusAdmin, w.admin.id)), 'nobody signs for another admin');
  assert.ok(!(await refused(confirmAs(w.campusAdmin, w.campusAdmin.id))), 'a campus admin can');

  // A connector cannot quietly move a newcomer out of the pipeline either.
  const newcomerPid = (await db.query<{ id: string }>(`SELECT id FROM participants WHERE profile_id = $1`, [w.newcomer.id])).rows[0].id;
  assert.ok(
    await refused(as(db, w.connector, (tx) =>
      tx.query(`UPDATE participants SET joined_as = 'member' WHERE id = $1 RETURNING id`, [newcomerPid]),
    )),
    'marking someone a member is an admin decision',
  );
  // Ordinary edits by a connector still work.
  assert.ok(
    !(await refused(as(db, w.connector, (tx) =>
      tx.query(`UPDATE participants SET notes = 'Prefers texts' WHERE id = $1 RETURNING id`, [newcomerPid]),
    ))),
  );
});

test('a confirmed member hosts after the orientation; a claimed one does not', async () => {
  const orientation = (await db.query<{ id: string }>(
    `SELECT id FROM lessons WHERE church_id = $1 AND purpose = 'host_orientation'`, [w.grace.id],
  )).rows[0].id;
  await db.query(`INSERT INTO lesson_completions (lesson_id, profile_id) VALUES ($1, $2)`, [orientation, claimed.id]);
  assert.equal(await canHost(claimed), false, 'saying you belong does not unlock hosting');

  await db.query(`UPDATE participants SET member_confirmed_at = now(), member_confirmed_by = $2 WHERE id = $1`, [claimedPid, w.admin.id]);
  assert.equal(await canHost(claimed), true, 'an admin-confirmed member who did the orientation can host');
  assert.deepEqual((await stage(claimedPid)).flags, [], 'confirmed: nothing left to do');

  await db.query(`DELETE FROM lesson_completions WHERE profile_id = $1`, [claimed.id]);
  assert.equal(await canHost(claimed), false, 'the orientation is still required');
});

test('invites are read by the church’s admins only, and written by nobody through the API', async () => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO church_invites (id, church_id, email, role, nonce, invited_by)
     VALUES ($1, $2, 'sam@example.com', 'connector', 'n0nce-n0nce-n0nce-1', $3)`,
    [id, w.grace.id, w.admin.id],
  );
  const sees = async (who: SeededUser) =>
    (await as(db, who, (tx) => tx.query(`SELECT id FROM church_invites WHERE id = $1`, [id]))).rows.length === 1;
  assert.ok(await sees(w.admin));
  assert.ok(await sees(w.campusAdmin));
  assert.equal(await sees(w.connector), false, 'connectors do not see invites');
  assert.equal(await sees(w.member), false);
  assert.equal(await sees(otherAdmin), false, 'another church’s admin does not');

  const err = await errorOf(as(db, w.admin, (tx) =>
    tx.query(`INSERT INTO church_invites (church_id, email, role, nonce) VALUES ($1, 'x@example.com', 'church_admin', 'n0nce-n0nce-n0nce-2')`, [w.grace.id]),
  ));
  assert.match(err ?? '', /permission denied/, 'invites are created by the server, after it checks the inviter');
  assert.ok(
    await refused(as(db, w.admin, (tx) => tx.query(`UPDATE church_invites SET role = 'church_admin' WHERE id = $1 RETURNING id`, [id]))),
  );
});

test('an invite points only at its own church’s campus, people and groups', async () => {
  const insert = (fields: string, values: string) =>
    errorOf(as(db, 'service', (tx) =>
      tx.query(`INSERT INTO church_invites (church_id, email, role, nonce${fields}) VALUES ($1, 'z@example.com', 'participant', 'n0nce-n0nce-n0nce-3'${values})`,
        [w.grace.id]),
    ));
  assert.match((await insert(', campus_id', `, '${w.other.campusId}'`)) ?? '', /campus/);
  const visitorPid = (await db.query<{ id: string }>(`SELECT id FROM participants WHERE profile_id = $1`, [w.visitor.id])).rows[0].id;
  assert.match((await insert(', participant_id', `, '${visitorPid}'`)) ?? '', /person/);
  assert.match((await insert(', group_ids', `, ARRAY['${w.groups.otherChurchGroup}']::uuid[]`)) ?? '', /group/);
  assert.equal(await insert(', group_ids', `, ARRAY['${w.groups.women}']::uuid[]`), null, 'its own group is fine');
});

test('one open invite per person per church', async () => {
  await db.query(`INSERT INTO church_invites (church_id, email, role, nonce) VALUES ($1, 'dup@example.com', 'participant', 'n0nce-n0nce-n0nce-4')`, [w.grace.id]);
  const err = await errorOf(db.query(`INSERT INTO church_invites (church_id, email, role, nonce) VALUES ($1, 'dup@example.com', 'connector', 'n0nce-n0nce-n0nce-5')`, [w.grace.id]));
  assert.match(err ?? '', /duplicate key/);
  // The same email can be invited by another church.
  assert.equal(await errorOf(db.query(`INSERT INTO church_invites (church_id, email, role, nonce) VALUES ($1, 'dup@example.com', 'participant', 'n0nce-n0nce-n0nce-6')`, [w.other.id])), null);
});

test('the test church can never be verified or listed', async () => {
  await db.query(`INSERT INTO churches (name, slug, is_test) VALUES ('Test Church', 'test-church-2', true)`);
  const err = await errorOf(db.query(`UPDATE churches SET verified_at = now(), listed_on_map = true WHERE slug = 'test-church-2'`));
  assert.match(err ?? '', /churches_test_never_listed/);
});

test('replying STOP turns texts off for that number everywhere; START turns them back on', async () => {
  await db.query(`UPDATE profiles SET phone = '(432) 555-0101', sms_consent_at = now() WHERE id = $1`, [w.member.id]);
  await db.query(`UPDATE participants SET phone = '+1 432-555-0101', sms_consent_at = now() WHERE profile_id = $1`, [w.member.id]);

  const err = await errorOf(as(db, w.member, (tx) => tx.query(`SELECT ec_sms_opt_change('+14325550101', false, 'sms_stop')`)));
  assert.match(err ?? '', /permission denied/, 'only the server records an opt-out');

  const off = await as(db, 'service', (tx) => tx.query<{ n: number }>(`SELECT ec_sms_opt_change('+14325550101', false, 'sms_stop') AS n`));
  assert.equal(off.rows[0].n, 2, 'the profile and the church record, whatever their formatting');
  // (as() rolls back; apply it for real to check the state.)
  await db.query(`SELECT ec_sms_opt_change('+14325550101', false, 'sms_stop')`);
  const after = await db.query<{ p: string | null; pa: string | null }>(
    `SELECT (SELECT sms_consent_at::text FROM profiles WHERE id = $1) AS p,
            (SELECT sms_consent_at::text FROM participants WHERE profile_id = $1) AS pa`, [w.member.id]);
  assert.deepEqual(after.rows[0], { p: null, pa: null });

  await db.query(`SELECT ec_sms_opt_change('4325550101', true, 'sms_start')`);
  const back = await db.query<{ src: string }>(`SELECT sms_consent_source AS src FROM profiles WHERE id = $1`, [w.member.id]);
  assert.equal(back.rows[0].src, 'sms_start');
  const short = await db.query<{ n: number }>(`SELECT ec_sms_opt_change('12', false, 'sms_stop') AS n`);
  assert.equal(short.rows[0].n, 0, 'a number too short to match changes nothing');
});
