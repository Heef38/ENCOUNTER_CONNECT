/**
 * The visibility and isolation rules, asserted against the real migrations.
 * This is the release gate the rethink (§7.10) calls for before the map
 * ships and before ec_can_see_event or the identity helpers change.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb, as, errorOf, refused } from './harness.ts';
import { seedWorld, type World } from './fixtures.ts';

let db: PGlite;
let w: World;

before(async () => {
  db = await freshDb();
  w = await seedWorld(db);
});

const visibleEvents = async (who: Parameters<typeof as>[1]) =>
  new Set(
    (await as(db, who, (tx) => tx.query<{ id: string }>(`SELECT id FROM events`))).rows.map((r) => r.id),
  );

// ── The anonymous Data API role ─────────────────────────────────

test('the anonymous API role cannot read any table', async () => {
  for (const table of ['events', 'profiles', 'churches', 'participants', 'scheduling_resources']) {
    const err = await errorOf(as(db, 'anon', (tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)));
    assert.match(err ?? '', /permission denied/, `${table} must be closed to anon`);
  }
});

// ── Girls night: the audience rule ─────────────────────────────

test('a private group gathering is visible to its group and staff only', async () => {
  const e = w.events.girlsNight;
  assert.ok((await visibleEvents(w.member)).has(e), 'group member sees it');
  assert.ok((await visibleEvents(w.host)).has(e), 'host sees it');
  assert.ok((await visibleEvents(w.connector)).has(e), 'connector sees it (staff override)');
  assert.ok((await visibleEvents(w.admin)).has(e), 'admin sees it');
  assert.ok(!(await visibleEvents(w.nonMember)).has(e), 'a non-member does not');
  assert.ok(!(await visibleEvents(w.ringMember)).has(e), 'the parent ring does not, unless invited');
  assert.ok(!(await visibleEvents(w.visitor)).has(e), 'another church does not');
});

test('church-wide and invite-only private gatherings reach exactly their audience', async () => {
  assert.ok((await visibleEvents(w.nonMember)).has(w.events.churchWide));
  assert.ok(!(await visibleEvents(w.visitor)).has(w.events.churchWide), 'church-wide stops at the church');
  assert.ok((await visibleEvents(w.nonMember)).has(w.events.inviteOnly), 'the invitee sees it');
  assert.ok(!(await visibleEvents(w.member)).has(w.events.inviteOnly), 'others do not');
});

test('public gatherings cross church lines; drafts and hidden ones do not', async () => {
  const visitorSees = await visibleEvents(w.visitor);
  assert.ok(visitorSees.has(w.events.publicCampus), 'public is public');
  assert.ok(visitorSees.has(w.events.cancelledPublic), 'a cancelled public gathering stays visible');
  assert.ok(!visitorSees.has(w.events.draft));
  assert.ok(!visitorSees.has(w.events.hidden));

  const memberSees = await visibleEvents(w.member);
  assert.ok(!memberSees.has(w.events.draft), 'a draft is the host’s');
  assert.ok(!memberSees.has(w.events.hidden), 'a reported gathering is pulled');
  assert.ok((await visibleEvents(w.host)).has(w.events.draft));
  assert.ok((await visibleEvents(w.campusAdmin)).has(w.events.hidden), 'staff can review it');
});

// ── The address rule ───────────────────────────────────────────

const canReadAddress = async (who: Parameters<typeof as>[1], eventId: string, rsvp?: 'going' | 'maybe') =>
  as(db, who, async (tx) => {
    if (rsvp && who !== 'anon' && who !== 'service') {
      await tx.query(
        `INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, $3)`,
        [eventId, who.id, rsvp],
      );
    }
    const r = await tx.query(`SELECT address_line1 FROM event_addresses WHERE event_id = $1`, [eventId]);
    return r.rows.length === 1;
  });

test('a home address is held until the member RSVPs going', async () => {
  const e = w.events.girlsNight;
  assert.equal(await canReadAddress(w.member, e), false, 'not before RSVP');
  assert.equal(await canReadAddress(w.member, e, 'maybe'), false, '"maybe" does not reveal a home');
  assert.equal(await canReadAddress(w.member, e, 'going'), true, '"going" does');
});

test('connectors earn a home address by RSVP; campus admins and the host see it', async () => {
  const e = w.events.girlsNight;
  assert.equal(await canReadAddress(w.connector, e), false, 'a volunteer connector does not get every home address');
  assert.equal(await canReadAddress(w.campusAdmin, e), true);
  assert.equal(await canReadAddress(w.host, e), true);
  assert.ok(await errorOf(canReadAddress(w.nonMember, e, 'going')), 'someone outside the audience cannot RSVP to reach it');
});

test('a public gathering’s address is public to anyone who can see it', async () => {
  assert.equal(await canReadAddress(w.visitor, w.events.publicCampus), true);
  assert.equal(await canReadAddress(w.visitor, w.events.churchWide), false);
});

// ── RSVPs and check-in ─────────────────────────────────────────

test('anyone can RSVP to a public gathering; private ones only from inside the audience', async () => {
  const ok = await errorOf(
    as(db, w.visitor, (tx) =>
      tx.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [w.events.publicCampus, w.visitor.id]),
    ),
  );
  assert.equal(ok, null, 'a visitor from another church can come to a public gathering');
  const denied = await errorOf(
    as(db, w.visitor, (tx) =>
      tx.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [w.events.churchWide, w.visitor.id]),
    ),
  );
  assert.ok(denied, 'but not to a private one');
});

test('members cannot check themselves in or self-waitlist; the host checks people in', async () => {
  const e = w.events.girlsNight;
  await db.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [e, w.member.id]);
  try {
    assert.ok(
      await errorOf(as(db, w.member, (tx) => tx.query(`UPDATE event_rsvps SET attended_at = now() WHERE event_id = $1 AND profile_id = $2`, [e, w.member.id]))),
      'self check-in is rejected',
    );
    assert.ok(
      await errorOf(as(db, w.member, (tx) => tx.query(`UPDATE event_rsvps SET status = 'waitlist' WHERE event_id = $1 AND profile_id = $2`, [e, w.member.id]))),
      'waitlist is the host’s tool',
    );
    const res = await as(db, w.host, (tx) =>
      tx.query(
        `UPDATE event_rsvps SET attended_at = now(), checked_in_by_profile_id = $3 WHERE event_id = $1 AND profile_id = $2 RETURNING id`,
        [e, w.member.id, w.host.id],
      ),
    );
    assert.equal(res.rows.length, 1, 'the host checks a member in');
  } finally {
    await db.query(`DELETE FROM event_rsvps WHERE event_id = $1`, [e]);
  }
});

test('who’s going: names only inside a private gathering, full roster for the host', async () => {
  const e = w.events.girlsNight;
  await db.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going'), ($1, $3, 'going')`, [e, w.member.id, w.host.id]);
  try {
    const asMember = await as(db, w.member, (tx) =>
      tx.query<{ first_name: string; last_name: string | null }>(`SELECT first_name, last_name FROM ec_event_attendees($1)`, [e]),
    );
    assert.equal(asMember.rows.length, 2, 'a going member sees who else is going');
    assert.ok(asMember.rows.every((r) => (r.last_name ?? '').length <= 1), 'as first name and last initial');

    const asHost = await as(db, w.host, (tx) =>
      tx.query<{ last_name: string }>(`SELECT last_name FROM ec_event_attendees($1)`, [e]),
    );
    assert.ok(asHost.rows.some((r) => r.last_name === 'Test'), 'the host sees full names');

    const asOutsider = await as(db, w.nonMember, (tx) => tx.query(`SELECT * FROM ec_event_attendees($1)`, [e]));
    assert.equal(asOutsider.rows.length, 0);
  } finally {
    await db.query(`DELETE FROM event_rsvps WHERE event_id = $1`, [e]);
  }
});

test('a public gathering never exposes its roster to members', async () => {
  await db.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [w.events.publicCampus, w.nonMember.id]);
  try {
    const r = await as(db, w.member, async (tx) => {
      await tx.query(`INSERT INTO event_rsvps (event_id, profile_id, status) VALUES ($1, $2, 'going')`, [w.events.publicCampus, w.member.id]);
      return tx.query(`SELECT * FROM ec_event_attendees($1)`, [w.events.publicCampus]);
    });
    assert.equal(r.rows.length, 0);
  } finally {
    await db.query(`DELETE FROM event_rsvps WHERE event_id = $1`, [w.events.publicCampus]);
  }
});

// ── What hosts and cohosts can change ──────────────────────────

test('a host cannot restore a reported gathering, pin one, or move it to another church', async () => {
  assert.ok(await errorOf(as(db, w.host, (tx) => tx.query(`UPDATE events SET status = 'published' WHERE id = $1`, [w.events.hidden]))));
  assert.ok(await errorOf(as(db, w.host, (tx) => tx.query(`UPDATE events SET pinned_at = now() WHERE id = $1`, [w.events.publicCampus]))));
  assert.ok(await errorOf(as(db, w.host, (tx) => tx.query(`UPDATE events SET church_id = $2 WHERE id = $1`, [w.events.publicCampus, w.other.id]))));
  const ok = await errorOf(as(db, w.campusAdmin, (tx) => tx.query(`UPDATE events SET status = 'published', hidden_at = NULL WHERE id = $1`, [w.events.hidden])));
  assert.equal(ok, null, 'an admin can restore it');
});

test('a host can edit and cancel their own gathering', async () => {
  const ok = await errorOf(
    as(db, w.host, (tx) => tx.query(`UPDATE events SET title = 'Prayer night (moved)', status = 'cancelled' WHERE id = $1`, [w.events.publicCampus])),
  );
  assert.equal(ok, null);
});

test('a cohost cannot change who sees a gathering or where it is', async () => {
  await db.query(`UPDATE events SET cohost_profile_id = $2 WHERE id = $1`, [w.events.churchWide, w.member.id]);
  try {
    assert.ok(await errorOf(as(db, w.member, (tx) => tx.query(`UPDATE events SET visibility = 'public' WHERE id = $1`, [w.events.churchWide]))));
    const ok = await errorOf(as(db, w.member, (tx) => tx.query(`UPDATE events SET description = 'Bring a chair' WHERE id = $1`, [w.events.churchWide])));
    assert.equal(ok, null, 'but can edit the details');
  } finally {
    await db.query(`UPDATE events SET cohost_profile_id = NULL WHERE id = $1`, [w.events.churchWide]);
  }
});

test('a public home gathering needs the church’s switch and the host’s acknowledgement', async () => {
  const flip = (ack: boolean) =>
    as(db, w.host, (tx) =>
      tx.query(
        `UPDATE events SET visibility = 'public', hide_address_until_rsvp = false,
                public_home_acknowledged_at = ${ack ? 'now()' : 'NULL'} WHERE id = $1`,
        [w.events.girlsNight],
      ),
    );
  assert.ok(await errorOf(flip(true)), 'off by default for a church');
  await db.query(`UPDATE church_settings SET allow_public_home_events = true WHERE church_id = $1`, [w.grace.id]);
  try {
    assert.ok(await errorOf(flip(false)), 'never without the acknowledgement');
    assert.equal(await errorOf(flip(true)), null, 'allowed once both are in place');
  } finally {
    await db.query(`UPDATE church_settings SET allow_public_home_events = false WHERE church_id = $1`, [w.grace.id]);
  }
});

// ── Youth and cross-church audiences ───────────────────────────

test('a youth gathering needs a staff host, privacy, and a held address', async () => {
  const target = (eventId: string) =>
    db.query(`INSERT INTO event_audiences (event_id, group_id) VALUES ($1, $2)`, [eventId, w.groups.students]);
  assert.ok(await errorOf(target(w.events.girlsNight)), 'a member-hosted home gathering cannot target students');

  await db.query(`UPDATE events SET host_profile_id = $2 WHERE id = $1`, [w.events.inviteOnly, w.admin.id]);
  assert.ok(await errorOf(target(w.events.inviteOnly)), 'staff host, but the address is not held');
  await db.query(`UPDATE events SET hide_address_until_rsvp = true WHERE id = $1`, [w.events.inviteOnly]);
  assert.equal(await errorOf(target(w.events.inviteOnly)), null, 'staff host, private, held address: allowed');
  assert.ok(
    await errorOf(as(db, w.admin, (tx) => tx.query(`UPDATE events SET visibility = 'public', hide_address_until_rsvp = false WHERE id = $1`, [w.events.inviteOnly]))),
    'and it can never be made public afterwards',
  );
});

test('audiences, invitees and cohosts stay inside the church', async () => {
  assert.ok(await errorOf(db.query(`INSERT INTO event_audiences (event_id, group_id) VALUES ($1, $2)`, [w.events.churchWide, w.groups.otherChurchGroup])));
  assert.ok(await errorOf(db.query(`INSERT INTO event_invites (event_id, profile_id) VALUES ($1, $2)`, [w.events.churchWide, w.visitor.id])));
  assert.ok(await errorOf(db.query(`UPDATE events SET cohost_profile_id = $2 WHERE id = $1`, [w.events.churchWide, w.visitor.id])));
});

test('reports come only from people who can see the gathering', async () => {
  assert.ok(
    await errorOf(as(db, w.visitor, (tx) => tx.query(`INSERT INTO event_reports (event_id, reporter_profile_id, reason) VALUES ($1, $2, 'spam')`, [w.events.churchWide, w.visitor.id]))),
  );
  assert.equal(
    await errorOf(as(db, w.member, (tx) => tx.query(`INSERT INTO event_reports (event_id, reporter_profile_id, reason) VALUES ($1, $2, 'spam')`, [w.events.churchWide, w.member.id]))),
    null,
  );
});

// ── Groups ─────────────────────────────────────────────────────

test('a roster shows members initials, leaders full names, outsiders nothing', async () => {
  const roster = (who: Parameters<typeof as>[1]) =>
    as(db, who, (tx) => tx.query<{ last_name: string | null }>(`SELECT last_name FROM ec_group_roster($1)`, [w.groups.womensMinistry]));
  const asMember = await roster(w.member);
  assert.equal(asMember.rows.length, 2);
  assert.ok(asMember.rows.every((r) => (r.last_name ?? '').length <= 1));
  assert.ok((await roster(w.host)).rows.some((r) => r.last_name === 'Test'), 'the leader sees full names');
  assert.equal((await roster(w.nonMember)).rows.length, 0);
});

test('a leader cannot add someone from another church', async () => {
  const err = await errorOf(
    as(db, w.host, (tx) => tx.query(`INSERT INTO group_members (group_id, profile_id) VALUES ($1, $2)`, [w.groups.womensMinistry, w.visitor.id])),
  );
  assert.ok(err);
  const ok = await errorOf(
    as(db, w.host, (tx) => tx.query(`INSERT INTO group_members (group_id, profile_id) VALUES ($1, $2)`, [w.groups.womensMinistry, w.nonMember.id])),
  );
  assert.equal(ok, null, 'but can add someone from their own church');
});

test('youth and private groups stay out of the member directory', async () => {
  const names = (await as(db, w.nonMember, (tx) => tx.query<{ name: string }>(`SELECT name FROM groups`))).rows.map((r) => r.name);
  assert.ok(names.includes('Women'));
  assert.ok(!names.includes('Students'));
  assert.ok(!names.includes('Other Church Group'));
});

// ── Hosting standing ───────────────────────────────────────────

const canHost = async (who: Parameters<typeof as>[1]) =>
  (await as(db, who, (tx) => tx.query<{ ok: boolean }>(`SELECT ec_can_host_events() AS ok`))).rows[0].ok;

test('hosting standing is earned per church and can be blocked or granted', async () => {
  assert.equal(await canHost(w.newcomer), false, 'a brand-new signup cannot host yet');
  assert.equal(await canHost(w.member), true);
  assert.equal(await canHost(w.connector), true);

  // Standing at another church does not carry.
  await db.query(
    `INSERT INTO participants (church_id, profile_id, first_name, last_name, status) VALUES ($1, $2, 'Nia', 'Test', 'completed')`,
    [w.other.id, w.newcomer.id],
  );
  assert.equal(await canHost(w.newcomer), false, 'completing a journey elsewhere does not unlock hosting here');

  await db.query(`UPDATE profiles SET host_blocked_at = now() WHERE id = $1`, [w.member.id]);
  assert.equal(await canHost(w.member), false, 'a blocked host cannot host');
  await db.query(`UPDATE profiles SET host_blocked_at = NULL WHERE id = $1`, [w.member.id]);

  await db.query(`UPDATE profiles SET trusted_host_at = now() WHERE id = $1`, [w.newcomer.id]);
  assert.equal(await canHost(w.newcomer), true, 'a trusted host can host without the journey');
  await db.query(`UPDATE profiles SET trusted_host_at = NULL WHERE id = $1`, [w.newcomer.id]);
});

test('only an admin of the church sets host standing, never the person', async () => {
  assert.ok(await refused(as(db, w.member, (tx) => tx.query(`UPDATE profiles SET trusted_host_at = now() WHERE id = $1 RETURNING id`, [w.member.id]))));
  assert.ok(await refused(as(db, w.connector, (tx) => tx.query(`UPDATE profiles SET host_blocked_at = now() WHERE id = $1 RETURNING id`, [w.member.id]))));
  assert.equal(
    await errorOf(as(db, w.campusAdmin, (tx) => tx.query(`UPDATE profiles SET host_blocked_at = now(), host_blocked_by = $2 WHERE id = $1`, [w.member.id, w.campusAdmin.id]))),
    null,
  );
});

// ── SchedulingCore isolation ───────────────────────────────────

test('connector calendars are readable only inside their church', async () => {
  const resources = async (who: Parameters<typeof as>[1]) =>
    new Set((await as(db, who, (tx) => tx.query<{ id: string }>(`SELECT id FROM scheduling_resources`))).rows.map((r) => r.id));
  assert.ok(!(await resources(w.visitor)).has(w.resources.graceConnector), 'another church cannot read our connectors’ contact details');
  assert.ok(!(await resources(w.member)).has(w.resources.graceConnector), 'members do not need connector calendars');
  assert.ok((await resources(w.admin)).has(w.resources.graceConnector));
  assert.ok(!(await resources(w.admin)).has(w.resources.otherConnector));
  assert.ok((await resources(w.connector)).has(w.resources.graceConnector), 'a connector sees their own');
});

test('appointment types belong to their church', async () => {
  const types = async (who: Parameters<typeof as>[1]) =>
    new Set((await as(db, who, (tx) => tx.query<{ id: string }>(`SELECT id FROM scheduling_appointment_types`))).rows.map((r) => r.id));
  assert.ok((await types(w.member)).has(w.appointmentTypes.grace));
  assert.ok(!(await types(w.member)).has(w.appointmentTypes.other));
  assert.ok(!(await types(w.admin)).has(w.appointmentTypes.other), 'not even for a church admin');
  assert.ok(
    await errorOf(
      as(db, w.admin, async (tx) => {
        const r = await tx.query(`UPDATE scheduling_appointment_types SET color = '#000000' WHERE id = $1 RETURNING id`, [w.appointmentTypes.other]);
        if (r.rows.length === 0) throw new Error('no rows updated');
      }),
    ),
  );
});

test('nobody can put a booking on another church’s calendar', async () => {
  const book = (who: Parameters<typeof as>[1], resource: string, type: string) =>
    as(db, who, (tx) =>
      tx.query(
        `INSERT INTO scheduling_bookings (appointment_type_id, resource_id, starts_at, ends_at, booked_by)
         VALUES ($1, $2, now() + interval '1 day', now() + interval '1 day 1 hour', $3)`,
        [type, resource, (who as { id: string }).id],
      ),
    );
  assert.ok(await errorOf(book(w.visitor, w.resources.graceConnector, w.appointmentTypes.grace)));
  assert.equal(await errorOf(book(w.member, w.resources.graceConnector, w.appointmentTypes.grace)), null);
});

test('a campus cannot be linked to another church’s room, nor a connector to its calendar', async () => {
  const otherRoom = crypto.randomUUID();
  await db.query(`INSERT INTO scheduling_locations (id, name) VALUES ($1, 'Their fellowship hall')`, [otherRoom]);
  await db.query(`UPDATE campuses SET scheduling_location_id = $2 WHERE id = $1`, [w.other.campusId, otherRoom]);
  assert.ok(
    await errorOf(as(db, w.admin, (tx) => tx.query(`UPDATE campuses SET scheduling_location_id = $2 WHERE id = $1`, [w.grace.campusId, otherRoom]))),
  );
  assert.ok(
    await errorOf(as(db, w.campusAdmin, (tx) => tx.query(`UPDATE connectors SET scheduling_resource_id = $2 WHERE profile_id = $1`, [w.connector.id, w.resources.otherConnector]))),
  );
});

// ── Map coordinates ────────────────────────────────────────────

test('a home is never sharper on the map than its campus pin', async () => {
  await db.query(`UPDATE campuses SET lat = 31.9686, lng = -102.0779 WHERE id = $1`, [w.grace.campusId]);
  const coords = async (id: string) =>
    (await db.query<{ public_lat: string | null; public_lng: string | null }>(
      `SELECT public_lat, public_lng FROM events WHERE id = $1`, [id],
    )).rows[0];

  // The fixture gave every gathering an exact geocode at 31.997, -102.077.
  const home = await coords(w.events.girlsNight);
  assert.equal(Number(home.public_lat), 31.9686, 'home snaps to the campus');

  const place = await coords(w.events.churchWide);
  assert.equal(Number(place.public_lat), 31.997, 'an open public place gets its own pin');

  await db.query(`UPDATE events SET hide_address_until_rsvp = true WHERE id = $1`, [w.events.churchWide]);
  assert.equal(Number((await coords(w.events.churchWide)).public_lat), 31.9686, 'a held address snaps back to the campus');

  // Whatever a caller writes, the database recomputes.
  await db.query(`UPDATE events SET public_lat = 31.997, public_lng = -102.077 WHERE id = $1`, [w.events.girlsNight]);
  assert.equal(Number((await coords(w.events.girlsNight)).public_lat), 31.9686, 'a caller cannot set a home’s pin');
});

test('a member can only aim a gathering at groups they belong to', async () => {
  const target = (who: Parameters<typeof as>[1], group: string) =>
    errorOf(as(db, who, (tx) => tx.query(`INSERT INTO event_audiences (event_id, group_id) VALUES ($1, $2)`, [w.events.churchWide, group])));
  // The host (a member) is in Women but not in a group created just now.
  const fresh = crypto.randomUUID();
  await db.query(`INSERT INTO groups (id, church_id, name) VALUES ($1, $2, 'Men')`, [fresh, w.grace.id]);
  assert.ok(await target(w.host, fresh), 'not a group they are in');
  assert.equal(await target(w.host, w.groups.women), null, 'their own group is fine');
});

test('only listed, verified churches appear as pins, and only as church pins', async () => {
  await db.query(`UPDATE campuses SET lat = 32.7, lng = -102.6 WHERE id = $1`, [w.other.campusId]);
  const pins = async () =>
    (await db.query<{ church_id: string; upcoming_public: number }>(`SELECT church_id, upcoming_public FROM ec_listed_church_pins()`)).rows;
  assert.equal((await pins()).length, 0, 'nobody is listed by default');

  await db.query(`UPDATE churches SET listed_on_map = true WHERE id = $1`, [w.other.id]);
  assert.equal((await pins()).length, 0, 'listing needs verification too');

  await db.query(`UPDATE churches SET verified_at = now() WHERE id = $1`, [w.other.id]);
  const listed = await pins();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].church_id, w.other.id);
  assert.equal(listed[0].upcoming_public, 1, 'their one public gathering is counted, nothing else is exposed');
});
