import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

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
    church_id: string;
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
  churchId: string | null,
): Promise<AppointmentRow[]> {
  // Service-role: bookings live in the scheduling core and aren't readable by
  // EC staff under RLS, so the inner-joined booking embed would drop every
  // row. We scope to the caller's church explicitly to stay tenant-safe
  // (churchId null = platform admin, all churches).
  const supabase = await createServiceRoleClient();
  const nowMs = Date.now();

  // Filtering/sorting on an embedded resource column is unreliable in
  // PostgREST, so we pull the linked rows and split upcoming/past in JS.
  const { data } = await supabase
    .from('participant_progress')
    .select(
      `scheduled_event_id,
       participant:participants!inner(
         id, first_name, last_name, email, phone, status, church_id,
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
    .not('scheduled_event_id', 'is', null)
    .limit(200);

  const rows = (data ?? []) as unknown as RawProgressRow[];

  return rows
    .filter((r) => r.booking && r.participant)
    .filter((r) => churchId === null || r.participant!.church_id === churchId)
    .filter((r) => {
      const t = new Date(r.booking!.starts_at).getTime();
      return scope === 'upcoming' ? t >= nowMs : t < nowMs;
    })
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
