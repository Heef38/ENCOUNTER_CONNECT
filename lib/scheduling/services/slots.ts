// REUSABLE CORE — Slot generation service (Supabase + slot-engine bridge)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GetAvailableSlotsInput, TimeSlot, ServiceResult } from '../types';
import { generateAvailableSlots, type BookingConflictRecord } from '../slot-engine';

export async function getAvailableSlots(
  supabase: SupabaseClient,
  input: GetAvailableSlotsInput
): Promise<ServiceResult<TimeSlot[]>> {
  const { appointment_type_id, resource_id, date_from, date_to } = input;

  // Load appointment type
  const { data: apptType, error: atErr } = await supabase
    .from('scheduling_appointment_types')
    .select('*')
    .eq('id', appointment_type_id)
    .single();

  if (atErr || !apptType) {
    return { success: false, error: 'Appointment type not found' };
  }

  // Resolve resources to check
  let resourceIds: string[] = [];
  if (resource_id) {
    resourceIds = [resource_id];
  } else {
    // Find all resources mapped to this appointment type
    const { data: mappings } = await supabase
      .from('scheduling_appointment_type_resource_map')
      .select('resource_id')
      .eq('appointment_type_id', appointment_type_id);

    if (mappings?.length) {
      resourceIds = mappings.map((m: { resource_id: string }) => m.resource_id);
    }
  }

  if (!resourceIds.length) {
    return { success: true, data: [] };
  }

  const allSlots: TimeSlot[] = [];

  for (const rid of resourceIds) {
    // Load resource
    const { data: resource } = await supabase
      .from('scheduling_resources')
      .select('id, timezone, default_capacity')
      .eq('id', rid)
      .eq('is_active', true)
      .single();

    if (!resource) continue;

    // Load availability rules
    const { data: rules } = await supabase
      .from('scheduling_availability_rules')
      .select('*')
      .eq('resource_id', rid)
      .eq('is_active', true);

    // Load blackouts in range
    const { data: blackouts } = await supabase
      .from('scheduling_blackouts')
      .select('*')
      .eq('resource_id', rid)
      .eq('is_active', true)
      .lt('starts_at', date_to.toISOString())
      .gt('ends_at', date_from.toISOString());

    // Load existing bookings in range
    const { data: existingBookings } = await supabase
      .from('scheduling_bookings')
      .select('id, resource_id, starts_at, ends_at, status')
      .eq('resource_id', rid)
      .not('status', 'in', '("cancelled","rescheduled","no_show")')
      .lt('starts_at', date_to.toISOString())
      .gt('ends_at', date_from.toISOString());

    const slots = generateAvailableSlots({
      appointmentType: apptType,
      resource: {
        id: resource.id,
        timezone: resource.timezone,
        default_capacity: resource.default_capacity,
      },
      availabilityRules: rules ?? [],
      blackouts: blackouts ?? [],
      existingBookings: (existingBookings ?? []) as BookingConflictRecord[],
      dateFrom: date_from,
      dateTo: date_to,
    });

    allSlots.push(...slots);
  }

  // Sort by time, then resource
  allSlots.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
  return { success: true, data: allSlots };
}
