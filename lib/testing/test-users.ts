/**
 * Test data harness constants. Lives in its own file so the constants
 * can be imported by both the server actions ('use server') file and
 * by client/server UI components — a 'use server' module can only
 * export async functions.
 */

export const TEST_CHURCH_SLUG = 'test-church';
export const TEST_CAMPUS_SLUG = 'test-campus';
/** A second test tenant, for rehearsing that churches never see each other. */
export const TEST_CHURCH_2_SLUG = 'test-church-two';
export const TEST_CAMPUS_2_SLUG = 'test-two-campus';
export const TEST_EMAIL_DOMAIN = 'test.local';
/**
 * Test accounts sign in with the password in TEST_USER_PASSWORD (at least
 * 12 characters). It is never hardcoded or shown on screen: the test church
 * lives in the production database.
 */
export const TEST_PASSWORD_ENV = 'TEST_USER_PASSWORD';

export interface TestUserSpec {
  key:
    | 'church_admin'
    | 'campus_admin'
    | 'connector_1'
    | 'connector_2'
    | 'participant_new'
    | 'participant_mid'
    | 'participant_done'
    | 'member'
    | 'member_claimed'
    | 'other_admin'
    | 'other_member';
  email: string;
  firstName: string;
  lastName: string;
  role: 'church_admin' | 'campus_admin' | 'connector' | 'participant';
  /** True for users who get a connectors row (regardless of profile.role). */
  isConnector: boolean;
  /** True for users who get a participants row. */
  isParticipant: boolean;
  /** Journey state: only applies to participants. */
  journey?: 'none' | 'mid' | 'done';
  /** How a participant came in: a confirmed member, or one who says they belong. */
  membership?: 'member' | 'claimed';
  /** The second test church instead of the first. */
  tenant?: 'second';
  /** Human-readable label for the UI. */
  label: string;
}

export const TEST_USERS: TestUserSpec[] = [
  {
    key: 'church_admin',
    email: `church-admin@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Casey',
    lastName: 'ChurchAdmin',
    role: 'church_admin',
    isConnector: false,
    isParticipant: false,
    label: 'Church admin — sees everything (people, flows, settings, audit)',
  },
  {
    key: 'campus_admin',
    email: `campus-admin@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Cam',
    lastName: 'CampusAdmin',
    role: 'campus_admin',
    isConnector: false,
    isParticipant: false,
    label: 'Campus admin — same as church admin minus settings',
  },
  {
    key: 'connector_1',
    email: `connector-1@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Connie',
    lastName: 'Connector',
    role: 'connector',
    isConnector: true,
    isParticipant: false,
    label: 'Connector — walks participants through the journey',
  },
  {
    key: 'connector_2',
    email: `connector-2@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Carlos',
    lastName: 'Connector',
    role: 'connector',
    isConnector: true,
    isParticipant: false,
    label: 'Connector — second connector to test load balancing',
  },
  {
    key: 'participant_new',
    email: `participant-new@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Pat',
    lastName: 'New',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    journey: 'none',
    label: 'Participant — fresh signup, no progress yet',
  },
  {
    key: 'participant_mid',
    email: `participant-mid@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Pam',
    lastName: 'Mid',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    journey: 'mid',
    label: 'Participant — in progress, first step active',
  },
  {
    key: 'participant_done',
    email: `participant-done@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Paul',
    lastName: 'Done',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    journey: 'done',
    label: 'Participant — every step completed',
  },
  {
    key: 'member',
    email: `member@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Mary',
    lastName: 'Member',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    membership: 'member',
    label: 'Member — already belonged, confirmed, in a home group, hosts the Tuesday group',
  },
  {
    key: 'member_claimed',
    email: `member-claimed@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Sam',
    lastName: 'Says',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    membership: 'claimed',
    label: 'Member — said "I already belong", waiting for an admin to confirm',
  },
  {
    key: 'other_admin',
    email: `other-admin@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Olive',
    lastName: 'OtherChurch',
    role: 'church_admin',
    isConnector: false,
    isParticipant: false,
    tenant: 'second',
    label: 'Church admin at Test Church Two — must never see Test Church',
  },
  {
    key: 'other_member',
    email: `other-member@${TEST_EMAIL_DOMAIN}`,
    firstName: 'Oscar',
    lastName: 'OtherChurch',
    role: 'participant',
    isConnector: false,
    isParticipant: true,
    membership: 'member',
    tenant: 'second',
    label: 'Member at Test Church Two',
  },
];
