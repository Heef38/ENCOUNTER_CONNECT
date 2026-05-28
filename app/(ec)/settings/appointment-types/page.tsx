import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { hashColor } from '@/lib/dashboard/colors';
import { ColorPicker } from './color-picker';

interface AppointmentTypeRow {
  id: string;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  is_public: boolean;
  color: string | null;
}

export default async function AppointmentTypesSettingsPage() {
  await requireChurchAdmin();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('scheduling_appointment_types')
    .select('id, name, duration_minutes, is_active, is_public, color')
    .order('name');

  const types = (data ?? []) as AppointmentTypeRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Appointment Types
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Configure the appointments your flows can schedule — duration, notice, and
            whether a connector must confirm. Pick a color so calendar entries match your
            scheme.
          </p>
        </div>
        <Link href="/settings/appointment-types/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New appointment type
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {types.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No appointment types yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Create your first one to let flows schedule meetings.
          </p>
          <Link href="/settings/appointment-types/new" className="mt-3 inline-block">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New appointment type
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Duration</TH>
                <TH>Visibility</TH>
                <TH>Color</TH>
              </TR>
            </THead>
            <TBody>
              {types.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link
                      href={`/settings/appointment-types/${t.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {t.name}
                    </Link>
                    {!t.is_active && (
                      <div className="mt-0.5 text-xs text-foreground-subtle">Inactive</div>
                    )}
                  </TD>
                  <TD className="text-foreground-muted">{t.duration_minutes} min</TD>
                  <TD>
                    {t.is_public ? (
                      <Badge tone="success">Public</Badge>
                    ) : (
                      <Badge tone="neutral">Internal</Badge>
                    )}
                  </TD>
                  <TD>
                    <ColorPicker
                      appointmentTypeId={t.id}
                      current={t.color}
                      fallback={hashColor(t.name)}
                      appointmentName={t.name}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-foreground-subtle">
        Note: appointment types are shared across all churches that share this scheduling
        instance. If your deployment serves multiple churches, color changes apply globally.
      </p>
    </div>
  );
}
