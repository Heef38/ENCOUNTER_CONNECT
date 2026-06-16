'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageSquare, Zap, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/notifications/actions';
import type { NotificationSettings } from '@/lib/notifications/settings';

export interface CatalogItem {
  toggle: keyof NotificationSettings;
  label: string;
  trigger: string;
  audience: string;
  channels: Array<'email' | 'sms'>;
  kind: 'instant' | 'scheduled';
  cadenceText?: string;
}

interface Props {
  items: CatalogItem[];
  settings: NotificationSettings;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

function DayInput({
  name,
  label,
  defaultValue,
}: {
  name: keyof NotificationSettings;
  label: string;
  defaultValue: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={name}
        name={name}
        type="number"
        min={1}
        defaultValue={defaultValue}
        className="h-8 w-20"
      />
      <Label htmlFor={name} className="mb-0 text-xs font-normal text-foreground-muted">
        {label}
      </Label>
    </div>
  );
}

export function NotificationSettingsForm({ items, settings, action }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {items.map((item) => (
          <div key={item.toggle} className="border-b border-border p-4 last:border-b-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  {item.kind === 'instant' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                      <Zap className="h-3 w-3" /> instant
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                      <CalendarClock className="h-3 w-3" /> scheduled
                    </span>
                  )}
                  {item.channels.map((ch) => (
                    <span key={ch} className="text-foreground-subtle" title={ch}>
                      {ch === 'email' ? (
                        <Mail className="h-3.5 w-3.5" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-foreground-muted">
                  {item.trigger} → <span className="text-foreground-subtle">{item.audience}</span>
                </p>
                {item.cadenceText && (
                  <p className="mt-0.5 text-xs text-foreground-subtle">{item.cadenceText}</p>
                )}

                {/* Cadence editors for the scheduled sweeps */}
                {item.toggle === 'stale_reminders_enabled' && (
                  <div className="mt-2 flex flex-wrap gap-4">
                    <DayInput
                      name="stale_first_reminder_days"
                      label="days → first nudge"
                      defaultValue={settings.stale_first_reminder_days}
                    />
                    <DayInput
                      name="stale_second_reminder_days"
                      label="days → second nudge"
                      defaultValue={settings.stale_second_reminder_days}
                    />
                  </div>
                )}
                {item.toggle === 'availability_reminders_enabled' && (
                  <div className="mt-2 flex flex-wrap gap-4">
                    <DayInput
                      name="availability_reminder_horizon_days"
                      label="day look-ahead"
                      defaultValue={settings.availability_reminder_horizon_days}
                    />
                    <DayInput
                      name="availability_reminder_interval_days"
                      label="days between nudges"
                      defaultValue={settings.availability_reminder_interval_days}
                    />
                  </div>
                )}
              </div>

              <label className="flex flex-none cursor-pointer items-center gap-2 text-xs text-foreground-muted">
                <input
                  type="checkbox"
                  name={item.toggle}
                  defaultChecked={settings[item.toggle] as boolean}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                On
              </label>
            </div>
          </div>
        ))}
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
        <p className="text-xs text-foreground-subtle">
          Reminders are checked on a schedule; these control when and how often a
          person is actually notified.
        </p>
      </div>
    </form>
  );
}
