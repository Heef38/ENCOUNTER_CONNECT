import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { getAppointments, type AppointmentScope } from '@/lib/appointments/queries';
import { AppointmentRow } from '@/components/appointments/appointment-row';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchParams {
  scope?: string;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaff();
  const params = await searchParams;
  const scope: AppointmentScope = params.scope === 'past' ? 'past' : 'upcoming';

  // Platform admins see every church; church/campus admins are scoped to theirs.
  const churchId = session.profile?.is_platform_admin
    ? null
    : session.profile?.church_id ?? null;
  const rows = await getAppointments(scope, churchId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Appointments
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Every connector ↔ participant appointment, in order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScopeTabs scope={scope} />
          <Link href="/scheduling/new-booking">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New appointment
            </Button>
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {scope === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
          </p>
          <p className="mt-1 text-sm text-foreground-muted">
            Appointments appear here when a flow step schedules a meeting, or
            click <span className="font-medium">New appointment</span> above to
            create one manually.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <AppointmentRow key={row.bookingId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScopeTabs({ scope }: { scope: AppointmentScope }) {
  const tabs: { value: AppointmentScope; label: string }[] = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past',     label: 'Past' },
  ];
  return (
    <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={`/appointments${t.value === 'upcoming' ? '' : `?scope=${t.value}`}`}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            scope === t.value
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
