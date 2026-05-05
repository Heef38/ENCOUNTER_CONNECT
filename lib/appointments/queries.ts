import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AppointmentScope = 'upcoming' | 'past';

export type BookingStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rescheduled';

export interface AppointmentRow {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  appointmentTypeName: string | null;
  typeColor: string | null;
  displayColor: string | null;

  connectorId: string | null;
  connectorName: string | null;

  participantId: string | null;
  participantName: string | null;
  participantStatus: string | null;
  participantEmail: string | null;
  participantPhone: string | null;

  campusName: string | null;
  locationName: string | null;
  currentStepTitle: string | null;
}

interface RawProgressRow {
  scheduled_event_id: string;
  participant: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    status: string;
    campus: { name: string } | null;
    current_step: { title: string } | null;
  } | null;
  booking: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: BookingStatus;
    display_color: string | null;
    location: { name: string } | null;
    appointment_type: { name: string; color: string | null } | null;
    resource: {
      id: string;
      connectors: Array<{
        id: string;
        profile: { first_name: string; last_name: string } | null;
      }>;
    } | null;
  } | null;
}

export async function getAppointments(
  scope: AppointmentScope,
): Promise<AppointmentRow[]> {
  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  let q = supabase
    .from('participant_progress')
    .select(
      `scheduled_event_id,
       participant:participants!inner(
         id, first_name, last_name, email, phone, status,
         campus:campuses(name),
         current_step:flow_steps!participants_current_step_id_fkey(title)
       ),
       booking:scheduling_bookings!inner(
         id, starts_at, ends_at, status, display_color,
         location:scheduling_locations(name),
         appointment_type:scheduling_appointment_types(name, color),
         resource:scheduling_resources(
           id,
           connectors(
             id,
             profile:profiles(first_name, last_name)
           )
         )
       )`,
    )
    .not('scheduled_event_id', 'is', null);

  if (scope === 'upcoming') {
    q = q.gte('booking.starts_at', now).order('booking.starts_at' as never, { ascending: true });
  } else {
    q = q.lt('booking.starts_at', now).order('booking.starts_at' as never, { ascending: false });
  }

  const { data } = await q.limit(100);

  const rows = (data ?? []) as unknown as RawProgressRow[];

  return rows
    .filter((r) => r.booking && r.participant)
    .map<AppointmentRow>((r) => {
      const booking = r.booking!;
      const participant = r.participant!;
      const firstConnector = booking.resource?.connectors?.[0] ?? null;
      const connectorName = firstConnector?.profile
        ? `${firstConnector.profile.first_name} ${firstConnector.profile.last_name}`.trim() || null
        : null;

      return {
        bookingId: booking.id,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        status: booking.status,
        appointmentTypeName: booking.appointment_type?.name ?? null,
        typeColor: booking.appointment_type?.color ?? null,
        displayColor: booking.display_color,

        connectorId: firstConnector?.id ?? null,
        connectorName,

        participantId: participant.id,
        participantName: `${participant.first_name} ${participant.last_name}`,
        participantStatus: participant.status,
        participantEmail: participant.email,
        participantPhone: participant.phone,

        campusName: participant.campus?.name ?? null,
        locationName: booking.location?.name ?? null,
        currentStepTitle: participant.current_step?.title ?? null,
      };
    })
    .sort((a, b) =>
      scope === 'upcoming'
        ? a.startsAt.localeCompare(b.startsAt)
        : b.startsAt.localeCompare(a.startsAt),
    );
}
