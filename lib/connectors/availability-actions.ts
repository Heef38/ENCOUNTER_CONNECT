'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireConnector } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

export interface DayWindow {
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

export interface AvailabilityResult {
  ok: boolean;
  error?: string;
  resourceId?: string;
  timezone?: string;
  windows?: DayWindow[];
}

const DEFAULT_TZ = 'America/Chicago';

/**
 * Ensures the given connector has a scheduling resource, creating a `person`
 * resource (church timezone, capacity 1) and linking it if missing. Not
 * exported — callers reach it only via the self-scoped actions below.
 */
async function ensureResource(
  connectorId: string,
): Promise<{ resourceId: string; timezone: string } | null> {
  const admin = await createServiceRoleClient();
  const { data: connector } = await admin
    .from('connectors')
    .select(
      'id, scheduling_resource_id, church_id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)',
    )
    .eq('id', connectorId)
    .maybeSingle();
  if (!connector) return null;

  let timezone = DEFAULT_TZ;
  if (connector.church_id) {
    const { data: church } = await admin
      .from('churches')
      .select('timezone')
      .eq('id', connector.church_id)
      .maybeSingle();
    if (church?.timezone) timezone = church.timezone as string;
  }

  if (connector.scheduling_resource_id) {
    const { data: res } = await admin
      .from('scheduling_resources')
      .select('id, timezone')
      .eq('id', connector.scheduling_resource_id)
      .maybeSingle();
    if (res) return { resourceId: res.id as string, timezone: res.timezone as string };
  }

  const profile = connector.profile as unknown as
    | { first_name: string; last_name: string }
    | null;
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Connector';

  const { data: created, error } = await admin
    .from('scheduling_resources')
    .insert({ name: name || 'Connector', kind: 'person', timezone, default_capacity: 1 })
    .select('id, timezone')
    .single();
  if (error || !created) return null;

  await admin
    .from('connectors')
    .update({ scheduling_resource_id: created.id })
    .eq('id', connectorId);

  return { resourceId: created.id as string, timezone: created.timezone as string };
}

/** Loads the current connector's weekly availability (provisioning a resource if needed). */
export async function getMyAvailability(): Promise<AvailabilityResult> {
  const { connectorId } = await requireConnector();
  const resource = await ensureResource(connectorId);
  if (!resource) return { ok: false, error: 'Could not set up your scheduling resource.' };

  const admin = await createServiceRoleClient();
  const { data: rules } = await admin
    .from('scheduling_availability_rules')
    .select('day_of_week, start_time, end_time, rule_type, is_active')
    .eq('resource_id', resource.resourceId)
    .eq('rule_type', 'recurring')
    .eq('is_active', true)
    .order('day_of_week');

  // One window per day for this editor; first rule per day wins.
  const seen = new Set<number>();
  const windows: DayWindow[] = [];
  for (const r of rules ?? []) {
    const dow = (r as { day_of_week: number | null }).day_of_week;
    if (dow == null || seen.has(dow)) continue;
    seen.add(dow);
    windows.push({
      day_of_week: dow,
      start_time: String((r as { start_time: string }).start_time).slice(0, 5),
      end_time: String((r as { end_time: string }).end_time).slice(0, 5),
    });
  }

  return { ok: true, resourceId: resource.resourceId, timezone: resource.timezone, windows };
}

/** Replaces the current connector's recurring weekly availability. */
export async function saveMyAvailability(windows: DayWindow[]): Promise<AvailabilityResult> {
  const { connectorId } = await requireConnector();
  const resource = await ensureResource(connectorId);
  if (!resource) return { ok: false, error: 'Could not set up your scheduling resource.' };

  for (const w of windows) {
    if (w.start_time >= w.end_time) {
      return { ok: false, error: 'Each day’s start time must be before its end time.' };
    }
  }

  const admin = await createServiceRoleClient();

  // Replace all recurring rules for this resource.
  const { error: delErr } = await admin
    .from('scheduling_availability_rules')
    .delete()
    .eq('resource_id', resource.resourceId)
    .eq('rule_type', 'recurring');
  if (delErr) return { ok: false, error: delErr.message };

  if (windows.length > 0) {
    const rows = windows.map((w) => ({
      resource_id: resource.resourceId,
      rule_type: 'recurring' as const,
      day_of_week: w.day_of_week,
      start_time: `${w.start_time}:00`,
      end_time: `${w.end_time}:00`,
      timezone: resource.timezone,
      is_active: true,
    }));
    const { error: insErr } = await admin.from('scheduling_availability_rules').insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  await recordAudit({
    action: 'connector.availability_updated',
    entity_type: 'scheduling_resource',
    entity_id: resource.resourceId,
    metadata: { connector_id: connectorId, window_count: windows.length },
  });

  revalidatePath('/connector/availability');
  return { ok: true, resourceId: resource.resourceId, timezone: resource.timezone, windows };
}
