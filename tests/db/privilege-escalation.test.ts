/**
 * The two self-escalation paths found on 2026-10-08, reproduced against the
 * real migrations with production's legacy grants.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedChurch, seedUser, as, errorOf } from './harness.ts';

test('a participant cannot make themselves a platform admin', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const ana = await seedUser(db, { church: grace, role: 'participant' });

  const err = await errorOf(
    as(db, ana, (tx) =>
      tx.query(`UPDATE profiles SET is_platform_admin = true WHERE id = $1`, [ana.id]),
    ),
  );
  assert.ok(err, 'self-promotion to platform admin must be rejected');
});

test('a participant cannot change their own role or church', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const other = await seedChurch(db, 'Other');
  const ana = await seedUser(db, { church: grace, role: 'participant' });

  assert.ok(
    await errorOf(as(db, ana, (tx) => tx.query(`UPDATE profiles SET role = 'church_admin' WHERE id = $1`, [ana.id]))),
    'self-promotion to church admin must be rejected',
  );
  assert.ok(
    await errorOf(as(db, ana, (tx) => tx.query(`UPDATE profiles SET church_id = $2 WHERE id = $1`, [ana.id, other.id]))),
    'moving yourself into another church must be rejected',
  );
});

test('a brand-new auth user cannot insert their own profile as an admin', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const stranger = { id: crypto.randomUUID(), churchId: null, role: 'participant' as const };
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'x@test.local')`, [stranger.id]);

  const err = await errorOf(
    as(db, stranger, (tx) =>
      tx.query(
        `INSERT INTO profiles (id, role, church_id, is_platform_admin) VALUES ($1, 'church_admin', $2, true)`,
        [stranger.id, grace.id],
      ),
    ),
  );
  assert.ok(err, 'self-inserting an elevated profile must be rejected');
});

test('anyone cannot raise their own scheduling role', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const ana = await seedUser(db, { church: grace, role: 'participant' });
  // Production's auth trigger gives every user a participant user_profiles row.
  await db.query(
    `INSERT INTO user_profiles (id, role) VALUES ($1, 'participant') ON CONFLICT (id) DO NOTHING`,
    [ana.id],
  );

  const err = await errorOf(
    as(db, ana, (tx) => tx.query(`UPDATE user_profiles SET role = 'admin' WHERE id = $1`, [ana.id])),
  );
  assert.ok(err, 'self-promotion to scheduling admin must be rejected');
});

test('people can still edit their own contact details', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const ana = await seedUser(db, { church: grace, role: 'participant' });

  const res = await as(db, ana, (tx) =>
    tx.query(`UPDATE profiles SET phone = '+15555550100', first_name = 'Ana' WHERE id = $1 RETURNING phone`, [ana.id]),
  );
  assert.equal(res.rows.length, 1);
});

test('a church admin can still change roles inside their own church', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const admin = await seedUser(db, { church: grace, role: 'church_admin' });
  const ben = await seedUser(db, { church: grace, role: 'participant' });

  const res = await as(db, admin, (tx) =>
    tx.query<{ role: string }>(`UPDATE profiles SET role = 'connector' WHERE id = $1 RETURNING role`, [ben.id]),
  );
  assert.equal(res.rows[0]?.role, 'connector');
});

test('a campus admin cannot grant roles', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const campusAdmin = await seedUser(db, { church: grace, role: 'campus_admin' });
  const ben = await seedUser(db, { church: grace, role: 'participant' });

  assert.ok(
    await errorOf(
      as(db, campusAdmin, (tx) => tx.query(`UPDATE profiles SET role = 'church_admin' WHERE id = $1`, [ben.id])),
    ),
  );
  assert.ok(
    await errorOf(
      as(db, campusAdmin, (tx) => tx.query(`UPDATE profiles SET role = 'church_admin' WHERE id = $1`, [campusAdmin.id])),
    ),
  );
});

test('nobody but the person records their SMS consent', async () => {
  const db = await freshDb({ legacyGrants: true });
  const grace = await seedChurch(db, 'Grace');
  const admin = await seedUser(db, { church: grace, role: 'church_admin' });
  const ben = await seedUser(db, { church: grace, role: 'participant' });

  assert.ok(
    await errorOf(
      as(db, admin, (tx) => tx.query(`UPDATE profiles SET sms_consent_at = now() WHERE id = $1`, [ben.id])),
    ),
    'an admin must not be able to opt someone else in to texts',
  );
  const own = await as(db, ben, (tx) =>
    tx.query(`UPDATE profiles SET sms_consent_at = now(), sms_consent_source = 'profile_settings' WHERE id = $1 RETURNING id`, [ben.id]),
  );
  assert.equal(own.rows.length, 1);
});
