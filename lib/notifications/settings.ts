import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationChannel } from './types';

/**
 * Per-church notification settings. Mirrors the notification_settings table.
 * Toggles gate whether a notification type is enqueued at all; the day fields
 * tune the cadence of the two scheduled reminder sweeps.
 */
export interface NotificationSettings {
  step_complete_to_connector_enabled: boolean;
  meeting_scheduled_enabled: boolean;
  meeting_decision_enabled: boolean;
  meeting_notes_enabled: boolean;
  stale_reminders_enabled: boolean;
  availability_reminders_enabled: boolean;
  stale_first_reminder_days: number;
  stale_second_reminder_days: number;
  availability_reminder_horizon_days: number;
  availability_reminder_interval_days: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  step_complete_to_connector_enabled: true,
  meeting_scheduled_enabled: true,
  meeting_decision_enabled: true,
  meeting_notes_enabled: true,
  stale_reminders_enabled: true,
  availability_reminders_enabled: true,
  stale_first_reminder_days: 3,
  stale_second_reminder_days: 7,
  availability_reminder_horizon_days: 14,
  availability_reminder_interval_days: 7,
};

export type NotificationToggleKey = keyof Pick<
  NotificationSettings,
  | 'step_complete_to_connector_enabled'
  | 'meeting_scheduled_enabled'
  | 'meeting_decision_enabled'
  | 'meeting_notes_enabled'
  | 'stale_reminders_enabled'
  | 'availability_reminders_enabled'
>;

/**
 * Returns the church's settings merged over defaults. A church with no row
 * gets the defaults (which match the table defaults), so behavior is
 * unchanged until an admin saves.
 */
export async function getNotificationSettings(
  client: SupabaseClient,
  churchId: string,
): Promise<NotificationSettings> {
  const { data } = await client
    .from('notification_settings')
    .select('*')
    .eq('church_id', churchId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(data as Partial<NotificationSettings>) };
}

// ── Catalog (powers the "how it works" settings panel) ────────

export interface NotificationCatalogEntry {
  toggle: NotificationToggleKey;
  label: string;
  /** What causes this notification to be sent. */
  trigger: string;
  /** Who receives it. */
  audience: string;
  channels: NotificationChannel[];
  kind: 'instant' | 'scheduled';
  /** Human cadence string for scheduled types, given current settings. */
  cadence?: (s: NotificationSettings) => string;
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export const NOTIFICATION_CATALOG: NotificationCatalogEntry[] = [
  {
    toggle: 'step_complete_to_connector_enabled',
    label: 'Step completed',
    trigger: 'A participant finishes a journey step',
    audience: 'Their connector',
    channels: ['email'],
    kind: 'instant',
  },
  {
    toggle: 'meeting_scheduled_enabled',
    label: 'Meeting scheduled',
    trigger: 'A participant books a meeting',
    audience: 'The connector(s) and the participant',
    channels: ['email', 'sms'],
    kind: 'instant',
  },
  {
    toggle: 'meeting_decision_enabled',
    label: 'Meeting confirmed / declined',
    trigger: 'A connector confirms or declines a pending meeting',
    audience: 'The participant',
    channels: ['email', 'sms'],
    kind: 'instant',
  },
  {
    toggle: 'meeting_notes_enabled',
    label: 'Meeting notes shared',
    trigger: 'A connector shares notes after a meeting',
    audience: 'The participant',
    channels: ['email', 'sms'],
    kind: 'instant',
  },
  {
    toggle: 'stale_reminders_enabled',
    label: 'Stalled-journey reminders',
    trigger: 'A participant sits on the same step without progress',
    audience: 'The participant',
    channels: ['email'],
    kind: 'scheduled',
    cadence: (s) =>
      `Nudged at ${days(s.stale_first_reminder_days)} and again at ${days(
        s.stale_second_reminder_days,
      )} idle`,
  },
  {
    toggle: 'availability_reminders_enabled',
    label: 'Connector availability reminders',
    trigger: 'A connector (or team) has no availability set for the near future',
    audience: 'The connector(s)',
    channels: ['email', 'sms'],
    kind: 'scheduled',
    cadence: (s) =>
      `When nothing is set for the next ${days(
        s.availability_reminder_horizon_days,
      )}, repeating every ${days(s.availability_reminder_interval_days)}`,
  },
];
