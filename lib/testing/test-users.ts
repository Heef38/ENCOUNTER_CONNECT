/**
 * Test data harness constants. Lives in its own file so the constants
 * can be imported by both the server actions ('use server') file and
 * by client/server UI components — a 'use server' module can only
 * export async functions.
 */

export const TEST_CHURCH_SLUG = 'test-church';
export const TEST_CAMPUS_SLUG = 'test-campus';
export const TEST_EMAIL_DOMAIN = 'test.local';
export const TEST_PASSWORD = 'Test1234!';

export interface TestUserSpec {
  key:
    | 'church_admin'
    | 'campus_admin'
    | 'connector_1'
    | 'connector_2'
    | 'participant_new'
    | 'participant_mid'
    | 'participant_done';
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
];
