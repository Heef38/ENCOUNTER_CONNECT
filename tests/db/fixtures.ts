/**
 * A small world for visibility tests: two churches, every kind of viewer,
 * groups including the girls-night parent ring and a youth roster, and a
 * gathering of every visibility and status.
 */
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { seedChurch, seedUser, type SeededChurch, type SeededUser } from './harness.ts';

export interface World {
  grace: SeededChurch;
  other: SeededChurch;
  admin: SeededUser;
  campusAdmin: SeededUser;
  connector: SeededUser;
  host: SeededUser;
  member: SeededUser;
  ringMember: SeededUser;
  nonMember: SeededUser;
  newcomer: SeededUser;
  visitor: SeededUser;
  groups: { women: string; womensMinistry: string; students: string; otherChurchGroup: string };
  events: {
    publicCampus: string;
    girlsNight: string;
    churchWide: string;
    inviteOnly: string;
    draft: string;
    hidden: string;
    cancelledPublic: string;
    otherChurchPublic: string;
  };
  resources: { graceConnector: string; otherConnector: string };
  appointmentTypes: { grace: string; other: string };
}

async function insertEvent(
  db: PGlite,
  e: {
    church: SeededChurch;
    host: SeededUser;
    title: string;
    visibility: 'public' | 'private';
    status?: string;
    venue?: string;
    hideAddress?: boolean;
    churchWide?: boolean;
    cohost?: SeededUser;
  },
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO events (id, church_id, campus_id, event_type_id, title, starts_at, ends_at, timezone,
                         visibility, status, host_profile_id, cohost_profile_id, venue_kind,
                         hide_address_until_rsvp, audience_is_church_wide, city, published_at)
     VALUES ($1, $2, $3, (SELECT id FROM event_types WHERE church_id = $2 ORDER BY order_index LIMIT 1),
             $4, now() + interval '2 days', now() + interval '2 days 2 hours', 'America/Chicago',
             $5, $6, $7, $8, $9, $10, $11, 'Midland', now())`,
    [
      id,
      e.church.id,
      e.church.campusId,
      e.title,
      e.visibility,
      e.status ?? 'published',
      e.host.id,
      e.cohost?.id ?? null,
      e.venue ?? 'campus',
      e.hideAddress ?? false,
      e.churchWide ?? false,
    ],
  );
  await db.query(
    `INSERT INTO event_addresses (event_id, address_line1, postal_code, lat, lng)
     VALUES ($1, $2, '79701', 31.997, -102.077)`,
    [id, `${e.title} street address`],
  );
  return id;
}

export async function seedWorld(db: PGlite): Promise<World> {
  const grace = await seedChurch(db, 'Grace');
  const other = await seedChurch(db, 'Other');

  const admin = await seedUser(db, { church: grace, role: 'church_admin', firstName: 'Ada' });
  const campusAdmin = await seedUser(db, { church: grace, role: 'campus_admin', firstName: 'Cam' });
  const connector = await seedUser(db, { church: grace, role: 'connector', firstName: 'Connie' });
  const host = await seedUser(db, { church: grace, firstName: 'Hope', participantStatus: 'connected' });
  const member = await seedUser(db, { church: grace, firstName: 'Mia', participantStatus: 'connected' });
  const ringMember = await seedUser(db, { church: grace, firstName: 'Rae', participantStatus: 'connected' });
  const nonMember = await seedUser(db, { church: grace, firstName: 'Ned', participantStatus: 'connected' });
  const newcomer = await seedUser(db, { church: grace, firstName: 'Nia', participantStatus: 'new' });
  const visitor = await seedUser(db, { church: other, firstName: 'Vic', participantStatus: 'connected' });

  const group = async (church: SeededChurch, name: string, extra: { parent?: string; youth?: boolean } = {}) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO groups (id, church_id, name, kind, parent_group_id, is_youth)
       VALUES ($1, $2, $3, 'ministry', $4, $5)`,
      [id, church.id, name, extra.parent ?? null, extra.youth ?? false],
    );
    return id;
  };
  const women = await group(grace, 'Women');
  const womensMinistry = await group(grace, "Women's Ministry", { parent: women });
  const students = await group(grace, 'Students', { youth: true });
  const otherChurchGroup = await group(other, 'Other Church Group');

  const join = (g: string, u: SeededUser, role = 'member') =>
    db.query(`INSERT INTO group_members (group_id, profile_id, role) VALUES ($1, $2, $3)`, [g, u.id, role]);
  await join(women, member);
  await join(women, ringMember);
  await join(women, host);
  await join(womensMinistry, member);
  await join(womensMinistry, host, 'leader');

  const publicCampus = await insertEvent(db, { church: grace, host, title: 'Prayer night', visibility: 'public' });
  const girlsNight = await insertEvent(db, {
    church: grace, host, title: 'Girls night', visibility: 'private', venue: 'home', hideAddress: true,
  });
  await db.query(`INSERT INTO event_audiences (event_id, group_id) VALUES ($1, $2)`, [girlsNight, womensMinistry]);
  const churchWide = await insertEvent(db, {
    church: grace, host, title: 'Church picnic', visibility: 'private', venue: 'public_place', churchWide: true,
  });
  const inviteOnly = await insertEvent(db, { church: grace, host, title: 'Dinner', visibility: 'private', venue: 'public_place' });
  await db.query(`INSERT INTO event_invites (event_id, profile_id) VALUES ($1, $2)`, [inviteOnly, nonMember.id]);
  const draft = await insertEvent(db, { church: grace, host, title: 'Draft', visibility: 'public', status: 'draft' });
  const hidden = await insertEvent(db, { church: grace, host, title: 'Reported', visibility: 'public', status: 'hidden' });
  const cancelledPublic = await insertEvent(db, {
    church: grace, host, title: 'Rained out', visibility: 'public', status: 'cancelled',
  });
  const otherChurchPublic = await insertEvent(db, { church: other, host: visitor, title: 'Their prayer night', visibility: 'public' });

  // Connector calendars (SchedulingCore) linked through EC connectors.
  const resource = async (church: SeededChurch, owner: SeededUser, name: string) => {
    const rid = randomUUID();
    await db.query(
      `INSERT INTO scheduling_resources (id, name, email, phone, user_id) VALUES ($1, $2, 'c@x.test', '+15555550123', $3)`,
      [rid, name, owner.id],
    );
    await db.query(
      `INSERT INTO connectors (church_id, profile_id, campus_id, scheduling_resource_id, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [church.id, owner.id, church.campusId, rid],
    );
    return rid;
  };
  const otherConnectorUser = await seedUser(db, { church: other, role: 'connector', firstName: 'Oz' });
  const graceConnector = await resource(grace, connector, 'Connie calendar');
  const otherConnector = await resource(other, otherConnectorUser, 'Oz calendar');

  const apptType = async (church: SeededChurch, name: string) => {
    const aid = randomUUID();
    await db.query(
      `INSERT INTO scheduling_appointment_types (id, name, slug, church_id) VALUES ($1, $2, $3, $4)`,
      [aid, name, `${name.toLowerCase().replace(/\W+/g, '-')}-${aid.slice(0, 6)}`, church.id],
    );
    return aid;
  };
  const graceType = await apptType(grace, 'Connect meeting');
  const otherType = await apptType(other, 'Their meeting');

  return {
    grace, other, admin, campusAdmin, connector, host, member, ringMember, nonMember, newcomer, visitor,
    groups: { women, womensMinistry, students, otherChurchGroup },
    events: { publicCampus, girlsNight, churchWide, inviteOnly, draft, hidden, cancelledPublic, otherChurchPublic },
    resources: { graceConnector, otherConnector },
    appointmentTypes: { grace: graceType, other: otherType },
  };
}
