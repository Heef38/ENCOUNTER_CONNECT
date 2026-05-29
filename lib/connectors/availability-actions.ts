'use server';

import { revalidatePath } from 'next/cache';
import { addMonths, formatISO, startOfToday } from 'date-fns';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireConnector } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

/** A single available date with its time window. date = "YYYY-MM-DD". */
export interface DateWindow {
  date: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

export interface AvailabilityResult {
  ok: boolean;
  error?: string;
  resourceId?: string;
  timezone?: string;
  windows?: DateWindow[];
  /** Set when the connector is on a team — the shared calendar being edited. */
  teamName?: string;
}

const DEFAULT_TZ = 'America/Chicago';
/** Connectors may schedule availability this far ahead. */
const MONTHS_AHEAD = 3;

function todayStr(): string {
  return formatISO(startOfToday(), { representation: 'date' });
}
function horizonStr(): string {
  return formatISO(addMonths(startOfToday(), MONTHS_AHEAD), { representation: 'date' });
}

/**
 * Ensures the given connector has a scheduling resource, creating a `person`
 * resource (church timezone, capacity 1) and linking it if missing. Not
 * exported — callers reach it only via the self-scoped actions below.
 *
 * If the connector is on an ACTIVE team, the team's SHARED resource is
 * returned instead of the individual one — so both members read and write
 * the same calendar. `teamName` is set in that case.
 */
async function ensureResource(
  connectorId: string,
): Promise<{ resourceId: string; timezone: string; teamName?: string } | null> {
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

  // Team members edit the team's shared calendar, not their own.
  const { data: membership } = await admin
    .from('connector_team_members')
    .select('team:connector_teams!inner(id, name, scheduling_resource_id, is_active)')
    .eq('connector_id', connectorId)
    .maybeSingle();
  const team = (membership as unknown as {
    team: { id: string; name: string; scheduling_resource_id: string | null; is_active: boolean } | null;
  } | null)?.team;

  if (team && team.is_active) {
    if (team.scheduling_resource_id) {
      const { data: res } = await admin
        .from('scheduling_resources')
        .select('id, timezone')
        .eq('id', team.scheduling_resource_id)
        .maybeSingle();
      if (res) {
        return { resourceId: res.id as string, timezone: res.timezone as string, teamName: team.name };
      }
    }
    // Team somehow lacks a resource — provision one and link it to the team.
    const { data: created } = await admin
      .from('scheduling_resources')
      .insert({ name: team.name || 'Team', kind: 'person', timezone, default_capacity: 1 })
      .select('id, timezone')
      .single();
    if (created) {
      await admin
        .from('connector_teams')
        .update({ scheduling_resource_id: created.id })
        .eq('id', team.id);
      return { resourceId: created.id as string, timezone: created.timezone as string, teamName: team.name };
    }
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

/** Loads the current connector's per-date availability (provisioning a resource if needed). */
export async function getMyAvailability(): Promise<AvailabilityResult> {
  const { connectorId } = await requireConnector();
  const resource = await ensureResource(connectorId);
  if (!resource) return { ok: false, error: 'Could not set up your scheduling resource.' };

  const admin = await createServiceRoleClient();
  const { data: rules } = await admin
    .from('scheduling_availability_rules')
    .select('effective_from, start_time, end_time')
    .eq('resource_id', resource.resourceId)
    .eq('rule_type', 'date_specific')
    .eq('is_active', true)
    .gte('effective_from', todayStr())
    .order('effective_from');

  const windows: DateWindow[] = (rules ?? [])
    .filter((r) => (r as { effective_from: string | null }).effective_from)
    .map((r) => ({
      date: String((r as { effective_from: string }).effective_from).slice(0, 10),
      start_time: String((r as { start_time: string }).start_time).slice(0, 5),
      end_time: String((r as { end_time: string }).end_time).slice(0, 5),
    }));

  return {
    ok: true,
    resourceId: resource.resourceId,
    timezone: resource.timezone,
    windows,
    teamName: resource.teamName,
  };
}

/** Replaces the current connector's future per-date availability. */
export async function saveMyAvailability(windows: DateWindow[]): Promise<AvailabilityResult> {
  const { connectorId } = await requireConnector();
  const resource = await ensureResource(connectorId);
  if (!resource) return { ok: false, error: 'Could not set up your scheduling resource.' };

  const min = todayStr();
  const max = horizonStr();
  for (const w of windows) {
    if (w.start_time >= w.end_time) {
      return { ok: false, error: 'Each day’s start time must be before its end time.' };
    }
    if (w.date < min || w.date > max) {
      return { ok: false, error: `Dates must be within the next ${MONTHS_AHEAD} months.` };
    }
  }

  const admin = await createServiceRoleClient();

  // Replace all future date-specific rules for this resource.
  const { error: delErr } = await admin
    .from('scheduling_availability_rules')
    .delete()
    .eq('resource_id', resource.resourceId)
    .eq('rule_type', 'date_specific')
    .gte('effective_from', min);
  if (delErr) return { ok: false, error: delErr.message };

  if (windows.length > 0) {
    const rows = windows.map((w) => ({
      resource_id: resource.resourceId,
      rule_type: 'date_specific' as const,
      day_of_week: null,
      start_time: `${w.start_time}:00`,
      end_time: `${w.end_time}:00`,
      effective_from: w.date,
      effective_until: w.date,
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
    metadata: { connector_id: connectorId, date_count: windows.length },
  });

  revalidatePath('/connector/availability');
  return {
    ok: true,
    resourceId: resource.resourceId,
    timezone: resource.timezone,
    windows,
    teamName: resource.teamName,
  };
}
