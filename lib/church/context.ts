import 'server-only';

import { cache } from 'react';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isValidTimeZone } from '@/lib/time/zoned';

/**
 * What server code needs to know about a church to act inside it: its
 * timezone (every gathering's times are in it), its naming, and the policy
 * switches its admin owns (church_settings, migration 032).
 *
 * Read with the service role because callers include signed-out pages; it
 * returns only church-level facts, never people.
 */

export interface ChurchSettings {
  allow_public_home_events: boolean;
  require_host_orientation: boolean;
  require_public_event_approval: boolean;
  journey_mode: 'encounter' | 'simple' | 'custom' | 'none' | null;
  contact_within_days: number;
  plugged_in_within_days: number;
  admin_escalation_days: number;
  digest_enabled: boolean;
  digest_day_of_week: number;
  sms_sender_mode: 'platform' | 'own';
  sms_from_number: string | null;
  sms_messaging_service_sid: string | null;
  agreement_version: string | null;
  agreement_accepted_at: string | null;
}

export const DEFAULT_CHURCH_SETTINGS: ChurchSettings = {
  allow_public_home_events: false,
  require_host_orientation: true,
  require_public_event_approval: false,
  journey_mode: null,
  contact_within_days: 7,
  plugged_in_within_days: 30,
  admin_escalation_days: 3,
  digest_enabled: true,
  digest_day_of_week: 1,
  sms_sender_mode: 'platform',
  sms_from_number: null,
  sms_messaging_service_sid: null,
  agreement_version: null,
  agreement_accepted_at: null,
};

export interface ChurchContext {
  id: string;
  name: string;
  slug: string | null;
  connect_name: string | null;
  timezone: string;
  is_active: boolean;
  logo_url: string | null;
  brand_color: string | null;
  settings: ChurchSettings;
}

const FALLBACK_TZ = 'America/Chicago';

export const getChurchContext = cache(async (churchId: string): Promise<ChurchContext | null> => {
  const admin = await createServiceRoleClient();
  const [{ data: church }, { data: settings }] = await Promise.all([
    admin
      .from('churches')
      .select('id, name, slug, connect_name, timezone, is_active, logo_url, brand_color')
      .eq('id', churchId)
      .maybeSingle(),
    admin.from('church_settings').select('*').eq('church_id', churchId).maybeSingle(),
  ]);
  if (!church) return null;
  const c = church as Omit<ChurchContext, 'settings'>;
  return {
    ...c,
    timezone: c.timezone && isValidTimeZone(c.timezone) ? c.timezone : FALLBACK_TZ,
    settings: { ...DEFAULT_CHURCH_SETTINGS, ...((settings ?? {}) as Partial<ChurchSettings>) },
  };
});
