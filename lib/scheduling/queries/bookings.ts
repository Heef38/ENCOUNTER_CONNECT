// REUSABLE CORE — no app-specific imports.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListBookingsFilter, BookingWithRelations } from '../types';

export async function queryBookings(
  supabase: SupabaseClient,
  filter: ListBookingsFilter = {}
) {
  const {
    status,
    resource_id,
    appointment_type_id,
    booked_by,
    date_from,
    date_to,
    search,
    page = 1,
    per_page = 25,
  } = filter;

  let query = supabase
    .from('scheduling_bookings')
    .select(`
      *,
      appointment_type:scheduling_appointment_types(*),
      resource:scheduling_resources(*),
      location:scheduling_locations(*),
      attendees:scheduling_booking_attendees(*),
      outcome:scheduling_outcomes(*),
      external_refs:scheduling_external_refs(*)
    `)
    .order('starts_at', { ascending: true });

  if (status) {
    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }
  }
  if (resource_id)          query = query.eq('resource_id', resource_id);
  if (appointment_type_id)  query = query.eq('appointment_type_id', appointment_type_id);
  if (booked_by)            query = query.eq('booked_by', booked_by);
  if (date_from)            query = query.gte('starts_at', date_from);
  if (date_to)              query = query.lte('starts_at', date_to);
  if (search)               query = query.ilike('title', `%${search}%`);

  const from = (page - 1) * per_page;
  query = query.range(from, from + per_page - 1);

  return query;
}

export async function queryBookingById(
  supabase: SupabaseClient,
  id: string
): Promise<{ data: BookingWithRelations | null; error: unknown }> {
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .select(`
      *,
      appointment_type:scheduling_appointment_types(*),
      resource:scheduling_resources(*),
      location:scheduling_locations(*),
      attendees:scheduling_booking_attendees(*),
      status_history:scheduling_booking_status_history(*),
      outcome:scheduling_outcomes(*),
      external_refs:scheduling_external_refs(*),
      reminders:scheduling_reminders(*)
    `)
    .eq('id', id)
    .single();

  return { data: data as BookingWithRelations | null, error };
}
