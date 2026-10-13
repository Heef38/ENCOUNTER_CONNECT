import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession, type SessionUser } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Gate for the SchedulingCore server actions (app/scheduling/actions.ts).
 * Those run on the service role, and a server action can be called from
 * any page, so the proxy's /scheduling check does not cover them. Each
 * action first checks the caller is a church admin, campus admin or
 * platform admin (the same people the proxy lets onto /scheduling), then
 * that the row it touches is their church's.
 *
 * "Their church's" uses the database's own ownership helpers from
 * migration 031, called through the caller's RLS client so they answer for
 * this caller. A calendar or room no church has claimed yet counts as
 * theirs, because admins set one up before linking it.
 */

export type Denied = { success: false; error: string; code: 'FORBIDDEN' };

export interface SchedulingAdmin {
  session: SessionUser;
  churchId: string | null;
  isPlatform: boolean;
  /** The caller's own client, for the ownership helpers. */
  rls: SupabaseClient;
}

export const denied = (error = 'You can’t change this.'): Denied => ({ success: false, error, code: 'FORBIDDEN' });

export async function requireSchedulingAdmin(): Promise<SchedulingAdmin | Denied> {
  const session = await getSession();
  if (!session) return denied('Sign in required.');
  const role = session.profile?.role;
  const isPlatform = Boolean(session.profile?.is_platform_admin);
  if (!isPlatform && role !== 'church_admin' && role !== 'campus_admin') return denied();
  return {
    session,
    churchId: session.profile?.church_id ?? null,
    isPlatform,
    rls: await createServerSupabaseClient(),
  };
}

export const isDenied = (g: SchedulingAdmin | Denied): g is Denied => 'success' in g;

export async function ownsResource(g: SchedulingAdmin, resourceId: string): Promise<boolean> {
  if (g.isPlatform) return true;
  const [mine, unclaimed] = await Promise.all([
    g.rls.rpc('ec_resource_in_my_church', { rid: resourceId }),
    g.rls.rpc('ec_resource_is_unclaimed', { rid: resourceId }),
  ]);
  return mine.data === true || unclaimed.data === true;
}

export async function ownsLocation(g: SchedulingAdmin, locationId: string): Promise<boolean> {
  if (g.isPlatform) return true;
  const [mine, unclaimed] = await Promise.all([
    g.rls.rpc('ec_location_in_my_church', { lid: locationId }),
    g.rls.rpc('ec_location_is_unclaimed', { lid: locationId }),
  ]);
  return mine.data === true || unclaimed.data === true;
}

export async function ownsAppointmentType(
  g: SchedulingAdmin,
  admin: SupabaseClient,
  appointmentTypeId: string,
): Promise<boolean> {
  if (g.isPlatform) return true;
  const { data } = await admin
    .from('scheduling_appointment_types')
    .select('church_id')
    .eq('id', appointmentTypeId)
    .maybeSingle();
  const row = data as { church_id: string | null } | null;
  return Boolean(row && g.churchId && row.church_id === g.churchId);
}

export async function ownsBooking(g: SchedulingAdmin, admin: SupabaseClient, bookingId: string): Promise<boolean> {
  if (g.isPlatform) return true;
  const { data } = await admin
    .from('scheduling_bookings')
    .select('resource_id, appointment_type_id')
    .eq('id', bookingId)
    .maybeSingle();
  const row = data as { resource_id: string | null; appointment_type_id: string | null } | null;
  if (!row) return false;
  if (row.resource_id) return ownsResource(g, row.resource_id);
  return row.appointment_type_id ? ownsAppointmentType(g, admin, row.appointment_type_id) : false;
}

/** Availability rules and blackouts hang off a calendar or a room. */
export async function ownsResourceChild(
  g: SchedulingAdmin,
  admin: SupabaseClient,
  table: 'scheduling_availability_rules' | 'scheduling_blackouts',
  id: string,
): Promise<boolean> {
  if (g.isPlatform) return true;
  const { data } = await admin
    .from(table)
    .select(table === 'scheduling_blackouts' ? 'resource_id, location_id' : 'resource_id')
    .eq('id', id)
    .maybeSingle();
  const row = data as { resource_id: string | null; location_id?: string | null } | null;
  if (!row) return false;
  if (row.resource_id) return ownsResource(g, row.resource_id);
  if (row.location_id) return ownsLocation(g, row.location_id);
  return false; // a global blackout: platform admins only
}
