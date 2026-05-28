import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Pencil } from 'lucide-react';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getConnector } from '@/lib/connectors/services';
import { requireStaff } from '@/lib/auth/dal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_TONES: Record<string, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  new:         'info',
  in_progress: 'warning',
  connected:   'success',
  completed:   'neutral',
  inactive:    'danger',
};

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaff();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const role = session.profile?.role;
  const canManage =
    (session.profile?.is_platform_admin ?? false) ||
    role === 'church_admin' ||
    role === 'campus_admin';

  const [connectorResult, { data: participants }] = await Promise.all([
    getConnector(supabase, id),
    supabase
      .from('participants')
      .select('id, first_name, last_name, status, email')
      .eq('assigned_connector_id', id)
      .neq('status', 'inactive')
      .order('created_at', { ascending: false }),
  ]);

  if (!connectorResult.success) notFound();
  const connector = connectorResult.data;

  let bookings: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    appointment_type?: { name: string } | null;
    attendees: { display_name: string; role: string }[];
  }> = [];
  if (connector.scheduling_resource_id) {
    // Bookings live in the scheduling core, unreadable by EC admins under RLS;
    // read via service-role (already gated by requireStaff above).
    const admin = await createServiceRoleClient();
    const { data } = await admin
      .from('scheduling_bookings')
      .select(`id, starts_at, ends_at, status, appointment_type:scheduling_appointment_types(name),
               attendees:scheduling_booking_attendees(display_name, role)`)
      .eq('resource_id', connector.scheduling_resource_id)
      .in('status', ['confirmed', 'pending_confirmation'])
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(5);
    bookings = (data ?? []) as unknown as typeof bookings;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/connectors"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Connectors
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {connector.profile.first_name} {connector.profile.last_name}
          </h1>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {connector.profile.email ?? '—'}
            {connector.campus && (
              <span className="ml-2 text-foreground-subtle">· {connector.campus.name}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={connector.is_active ? 'success' : 'neutral'}>
            {connector.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {canManage && (
            <Link href={`/connectors/${connector.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-medium text-foreground">
              Assigned Participants ({participants?.length ?? 0})
            </h2>
          </div>
          {participants && participants.length > 0 ? (
            <div className="divide-y divide-border">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <Link
                      href={`/participants/${p.id}`}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      {p.first_name} {p.last_name}
                    </Link>
                    <p className="text-xs text-foreground-subtle">{p.email ?? '—'}</p>
                  </div>
                  <Badge tone={STATUS_TONES[p.status] ?? 'neutral'}>
                    {p.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-foreground-subtle">No participants assigned.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-medium text-foreground">Upcoming Meetings</h2>
            {connector.scheduling_resource_id && (
              <Link
                href={`/scheduling/resources/${connector.scheduling_resource_id}`}
                className="text-xs text-primary hover:underline"
              >
                Manage availability →
              </Link>
            )}
          </div>
          {bookings.length > 0 ? (
            <div className="divide-y divide-border">
              {bookings.map((b) => {
                const primary = b.attendees.find((a) => a.role === 'primary');
                return (
                  <div key={b.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {new Date(b.starts_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      at{' '}
                      {new Date(b.starts_at).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    {primary && (
                      <p className="text-xs text-foreground-muted">{primary.display_name}</p>
                    )}
                    {b.appointment_type && (
                      <p className="text-xs text-foreground-subtle">{b.appointment_type.name}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-foreground-subtle">
              No upcoming meetings.{' '}
              {!connector.scheduling_resource_id && (
                <span>
                  Link this connector to a scheduling resource to track meetings.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
