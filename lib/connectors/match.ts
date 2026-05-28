import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from 'date-fns';
import {
  generateAvailableSlots,
  type BookingConflictRecord,
} from '@/lib/scheduling/slot-engine';
import type {
  SchedulingAppointmentType,
  SchedulingAvailabilityRule,
  SchedulingBlackout,
} from '@/lib/scheduling/types';

export interface ProposedSlot {
  starts_at: string;
  ends_at: string;
  /** Connectors who are free at this exact slot. The booker picks among these. */
  eligible_connector_ids: string[];
}

export interface ProposeSlotsInput {
  campusId: string;
  appointmentTypeId: string;
  daysAhead?: number;
  count?: number;
  now?: Date;
}

/**
 * Aggregates availability across every active connector at a campus and
 * returns ALL available slots chronologically, each annotated with the
 * connectors free at that exact time. This is the source of truth for both
 * the "see all times" list and booking validation.
 *
 * Returns an empty array if no connectors are configured or no availability
 * exists in the window.
 */
export async function listConnectorSlots(
  admin: SupabaseClient,
  input: ProposeSlotsInput,
): Promise<ProposedSlot[]> {
  const daysAhead = input.daysAhead ?? 14;
  const now = input.now ?? new Date();
  const dateFrom = now;
  const dateTo = addDays(now, daysAhead);

  // 1. Connectors at this campus with a scheduling resource
  const { data: connectors } = await admin
    .from('connectors')
    .select('id, scheduling_resource_id')
    .eq('campus_id', input.campusId)
    .eq('is_active', true)
    .not('scheduling_resource_id', 'is', null);

  type Conn = { id: string; scheduling_resource_id: string };
  const eligibleConnectors = (connectors ?? []).filter(
    (c): c is Conn => c.scheduling_resource_id !== null,
  );

  if (eligibleConnectors.length === 0) return [];

  // 2. Appointment type
  const { data: apptType } = await admin
    .from('scheduling_appointment_types')
    .select('*')
    .eq('id', input.appointmentTypeId)
    .maybeSingle();

  if (!apptType) return [];
  const appt = apptType as SchedulingAppointmentType;

  // 3. For each connector's resource, generate slots in window.
  // Map: slot key (ISO start) → { ends_at, eligible_connector_ids[] }
  const slotMap = new Map<string, { ends_at: string; connectorIds: string[] }>();

  for (const conn of eligibleConnectors) {
    const resourceId = conn.scheduling_resource_id;

    const [{ data: resource }, { data: rules }, { data: blackouts }, { data: bookings }] =
      await Promise.all([
        admin
          .from('scheduling_resources')
          .select('id, timezone, default_capacity')
          .eq('id', resourceId)
          .eq('is_active', true)
          .maybeSingle(),
        admin
          .from('scheduling_availability_rules')
          .select('*')
          .eq('resource_id', resourceId)
          .eq('is_active', true),
        admin
          .from('scheduling_blackouts')
          .select('*')
          .eq('resource_id', resourceId)
          .eq('is_active', true)
          .lt('starts_at', dateTo.toISOString())
          .gt('ends_at', dateFrom.toISOString()),
        admin
          .from('scheduling_bookings')
          .select('id, resource_id, starts_at, ends_at, status')
          .eq('resource_id', resourceId)
          .not('status', 'in', '("cancelled","rescheduled","no_show")')
          .lt('starts_at', dateTo.toISOString())
          .gt('ends_at', dateFrom.toISOString()),
      ]);

    if (!resource) continue;

    const slots = generateAvailableSlots({
      appointmentType: appt,
      resource: {
        id: resource.id as string,
        timezone: resource.timezone as string,
        default_capacity: resource.default_capacity as number,
      },
      availabilityRules: (rules ?? []) as SchedulingAvailabilityRule[],
      blackouts: (blackouts ?? []) as SchedulingBlackout[],
      existingBookings: (bookings ?? []) as BookingConflictRecord[],
      dateFrom,
      dateTo,
      now,
    });

    for (const s of slots) {
      if (!s.available) continue;
      const key = s.starts_at.toISOString();
      const existing = slotMap.get(key);
      if (existing) {
        existing.connectorIds.push(conn.id);
      } else {
        slotMap.set(key, {
          ends_at: s.ends_at.toISOString(),
          connectorIds: [conn.id],
        });
      }
    }
  }

  return Array.from(slotMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => ({
      starts_at: key,
      ends_at: val.ends_at,
      eligible_connector_ids: val.connectorIds,
    }));
}

/**
 * Picks up to N proposed slots from the full availability set, spread across
 * distinct days then distinct hour-buckets so the picks don't all sit in the
 * same morning. The participant picks one; the booker resolves the actual
 * connector at booking time (least-loaded wins).
 */
export async function proposeConnectorSlots(
  admin: SupabaseClient,
  input: ProposeSlotsInput,
): Promise<ProposedSlot[]> {
  const count = input.count ?? 3;
  const all = await listConnectorSlots(admin, input);
  if (all.length === 0) return [];

  // Sorted chronologically already.
  const sorted = all.map((s) => [s.starts_at, { ends_at: s.ends_at, connectorIds: s.eligible_connector_ids }] as const);

  const picks: ProposedSlot[] = [];
  const usedDays = new Set<string>();
  const usedHourBuckets = new Set<string>(); // `${day}T${hour}`

  for (const pass of [
    // Pass 1: distinct days
    (key: string) => !usedDays.has(dayKey(key)),
    // Pass 2: distinct hour buckets
    (key: string) => !usedHourBuckets.has(hourKey(key)),
    // Pass 3: anything still available
    () => true,
  ]) {
    if (picks.length >= count) break;
    for (const [key, val] of sorted) {
      if (picks.length >= count) break;
      if (picks.some((p) => p.starts_at === key)) continue;
      if (!pass(key)) continue;
      picks.push({
        starts_at: key,
        ends_at: val.ends_at,
        eligible_connector_ids: val.connectorIds,
      });
      usedDays.add(dayKey(key));
      usedHourBuckets.add(hourKey(key));
    }
  }

  return picks;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function hourKey(iso: string): string {
  return iso.slice(0, 13); // YYYY-MM-DDTHH
}

/**
 * Given a set of eligible connector ids and a campus, returns the id of
 * the connector with the fewest active (non-completed, non-inactive)
 * participants. Used at booking time to balance load across connectors
 * who happen to be free at the chosen slot.
 *
 * Falls back to the first id if no participant counts are available.
 */
export async function pickLeastLoadedConnector(
  admin: SupabaseClient,
  connectorIds: string[],
): Promise<string | null> {
  if (connectorIds.length === 0) return null;
  if (connectorIds.length === 1) return connectorIds[0];

  const { data } = await admin
    .from('participants')
    .select('assigned_connector_id')
    .in('assigned_connector_id', connectorIds)
    .not('status', 'in', '("completed","inactive")');

  const counts = new Map<string, number>();
  for (const id of connectorIds) counts.set(id, 0);
  for (const row of data ?? []) {
    const cid = (row as { assigned_connector_id: string | null }).assigned_connector_id;
    if (cid && counts.has(cid)) counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  let bestId = connectorIds[0];
  let bestCount = counts.get(bestId) ?? Number.MAX_SAFE_INTEGER;
  for (const id of connectorIds) {
    const c = counts.get(id) ?? 0;
    if (c < bestCount) {
      bestId = id;
      bestCount = c;
    }
  }
  return bestId;
}
