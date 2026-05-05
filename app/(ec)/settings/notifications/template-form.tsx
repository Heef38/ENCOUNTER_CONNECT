'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NotificationTemplate } from '@/lib/notifications/types';
import type { ActionResult } from '@/lib/notifications/actions';

interface Props {
  template?: NotificationTemplate;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

const KNOWN_KEYS = [
  { key: 'step_complete_to_connector',         hint: 'Sent to the assigned connector when a participant completes a step.' },
  { key: 'step_stale_3_day',                   hint: 'Sent to the participant if they go idle on a step for 3 days.' },
  { key: 'step_stale_7_day',                   hint: 'Sent to the participant if they go idle on a step for 7 days.' },
  { key: 'meeting_scheduled_to_connector',     hint: 'Sent to the connector when a participant books a meeting via auto-match.' },
  { key: 'meeting_scheduled_to_participant',   hint: 'Sent to the participant when their meeting is booked.' },
  { key: 'meeting_confirmed_to_participant',   hint: 'Sent to the participant when the connector confirms a pending meeting.' },
  { key: 'meeting_declined_to_participant',    hint: 'Sent to the participant when the connector declines a meeting; prompts them to repick.' },
];

export function TemplateForm({
  template,
  action,
  submitLabel,
  redirectOnSuccess,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok && redirectOnSuccess) {
        router.push(redirectOnSuccess);
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="key">Key</Label>
          <Input
            id="key"
            name="key"
            required
            defaultValue={template?.key ?? ''}
            placeholder="step_complete_to_connector"
            className="font-mono text-xs"
          />
          <p className="text-xs text-foreground-subtle">
            Stable identifier the app looks up. Built-in keys:
          </p>
          <ul className="ml-4 list-disc text-xs text-foreground-subtle">
            {KNOWN_KEYS.map((k) => (
              <li key={k.key}>
                <span className="font-mono">{k.key}</span> — {k.hint}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={template?.name ?? ''}
            placeholder="Step complete — connector"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="channel">Channel</Label>
          <select
            id="channel"
            name="channel"
            defaultValue={template?.channel ?? 'email'}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={template?.is_active ?? true}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject (email only)</Label>
        <Input
          id="subject"
          name="subject"
          defaultValue={template?.subject ?? ''}
          placeholder="{{participant_name}} completed: {{step_title}}"
        />
        <p className="text-xs text-foreground-subtle">
          Use <span className="font-mono">{'{{participant_name}}'}</span>,{' '}
          <span className="font-mono">{'{{participant_first_name}}'}</span>,{' '}
          <span className="font-mono">{'{{step_title}}'}</span>,{' '}
          <span className="font-mono">{'{{recipient_first_name}}'}</span>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body</Label>
        <Textarea
          id="body"
          name="body"
          rows={10}
          required
          defaultValue={template?.body ?? ''}
          placeholder={
            'Hi {{recipient_first_name}},\n\n' +
            '{{participant_name}} just finished "{{step_title}}". They\'re ready for the next step.\n\n' +
            '— Encounter Connect'
          }
          className="font-mono text-xs"
        />
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
