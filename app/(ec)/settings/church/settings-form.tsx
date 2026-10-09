'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { saveChurchSettings, type SettingsResult } from '@/lib/church/settings-actions';
import type { ChurchSettings } from '@/lib/church/context';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ChurchSettingsForm({
  church,
  settings,
}: {
  church: {
    name: string;
    connect_name: string | null;
    description: string | null;
    service_times: string | null;
    listed_on_map: boolean;
    verified: boolean;
  };
  settings: ChurchSettings;
}) {
  const [state, action, pending] = useActionState<SettingsResult | null, FormData>(saveChurchSettings, null);
  const select = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Your church&apos;s name for this</h2>
          <div>
            <Label htmlFor="connect_name">Connect name</Label>
            <Input id="connect_name" name="connect_name" defaultValue={church.connect_name ?? ''} placeholder={`${church.name} Connect`} maxLength={60} className="mt-1" />
            <p className="mt-1 text-xs text-foreground-subtle">
              What your people see, shown as &ldquo;{church.connect_name || `${church.name} Connect`} through ChurchConnect.&rdquo; Emails are signed with it.
            </p>
          </div>
          <div>
            <Label htmlFor="description">About your church (public page)</Label>
            <textarea id="description" name="description" defaultValue={church.description ?? ''} rows={3} className={select} />
          </div>
          <div>
            <Label htmlFor="service_times">Service times (public page)</Label>
            <textarea
              id="service_times"
              name="service_times"
              defaultValue={church.service_times ?? ''}
              rows={2}
              maxLength={500}
              placeholder="Sundays at 9:00 and 10:45 AM"
              className={select}
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" name="listed_on_map" defaultChecked={church.listed_on_map} className="mt-0.5" />
            <span>
              Show our church on the shared map
              <span className="block text-xs text-foreground-muted">
                Other churches&apos; members and visitors see your campus pin and how many open gatherings you have.
                {church.verified ? ' Your church is verified.' : ' Your pin appears once ChurchConnect verifies your church.'}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Gatherings</h2>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" name="allow_public_home_events" defaultChecked={settings.allow_public_home_events} className="mt-0.5" />
            <span>
              Hosts may make a gathering at their home public
              <span className="block text-xs text-foreground-muted">
                A public gathering is on the open internet. Hosts still have to confirm, in plain words, that their address
                will be public. A home is never pinned on the map either way.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" name="require_host_orientation" defaultChecked={settings.require_host_orientation} className="mt-0.5" />
            <span>
              Hosts finish the five-minute host orientation first
              <span className="block text-xs text-foreground-muted">
                Members host once their first meeting is done and they&apos;ve done the orientation in Learn. You can mark anyone a trusted host on their page.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Welcoming new people</h2>
          <div>
            <Label htmlFor="journey_mode">How you welcome people</Label>
            <select id="journey_mode" name="journey_mode" defaultValue={settings.journey_mode ?? ''} className={select}>
              <option value="">Not chosen yet</option>
              <option value="encounter">Encounter&apos;s video journey</option>
              <option value="simple">Simple next steps (a gathering, then a connector)</option>
              <option value="custom">A journey we built (for example, a membership class)</option>
              <option value="none">A handshake and a conversation, no journey</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="contact_within_days">Reach out within (days)</Label>
              <Input id="contact_within_days" name="contact_within_days" type="number" min={1} max={60} defaultValue={settings.contact_within_days} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="plugged_in_within_days">At a table within (days)</Label>
              <Input id="plugged_in_within_days" name="plugged_in_within_days" type="number" min={7} max={180} defaultValue={settings.plugged_in_within_days} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="admin_escalation_days">Tell a campus admin after (days)</Label>
              <Input id="admin_escalation_days" name="admin_escalation_days" type="number" min={1} max={14} defaultValue={settings.admin_escalation_days} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-foreground-subtle">
            When someone hasn&apos;t been reached in time, their connector gets a nudge. If the connector hasn&apos;t acted after the last number of days, a campus admin hears about it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">The weekly email</h2>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="digest_enabled" defaultChecked={settings.digest_enabled} />
            Send admins a weekly summary
          </label>
          <div>
            <Label htmlFor="digest_day_of_week">On</Label>
            <select id="digest_day_of_week" name="digest_day_of_week" defaultValue={settings.digest_day_of_week} className={select}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Texting</h2>
          <fieldset className="space-y-2 text-sm text-foreground">
            <label className="flex items-start gap-2">
              <input type="radio" name="sms_sender_mode" value="platform" defaultChecked={settings.sms_sender_mode !== 'own'} className="mt-0.5" />
              <span>
                Use ChurchConnect&apos;s number
                <span className="block text-xs text-foreground-muted">Texts go out from the platform&apos;s registered number, signed with your connect name.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="sms_sender_mode" value="own" defaultChecked={settings.sms_sender_mode === 'own'} className="mt-0.5" />
              <span>
                Use our own number
                <span className="block text-xs text-foreground-muted">
                  For a number registered to your church under its own A2P brand and campaign in ChurchConnect&apos;s Twilio account. Ask ChurchConnect to set it up first.
                </span>
              </span>
            </label>
          </fieldset>
          <details className="rounded-md border border-border bg-surface-muted/40 p-3 text-xs leading-relaxed text-foreground-muted">
            <summary className="cursor-pointer text-sm font-medium text-foreground">How texting works for your people</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Only people who gave a mobile number and agreed to texts get them. Everyone else gets email.</li>
              <li>They get texts about their own meetings, gatherings they&apos;re part of, and their next steps. Never marketing.</li>
              <li>Every text is signed with your connect name, so people know it&apos;s from you.</li>
              <li>Replying STOP stops all texts from that number at once, and their account shows texts off. START turns them back on.</li>
              <li>People can turn texts on or off themselves, on their account page.</li>
              <li>The platform number is registered for church connection messages. Your own number needs its own registration first.</li>
            </ul>
          </details>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sms_from_number">Our number</Label>
              <Input id="sms_from_number" name="sms_from_number" defaultValue={settings.sms_from_number ?? ''} placeholder="+14325551234" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="sms_messaging_service_sid">Or Messaging Service SID</Label>
              <Input id="sms_messaging_service_sid" name="sms_messaging_service_sid" defaultValue={settings.sms_messaging_service_sid ?? ''} placeholder="MG…" className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {state && !state.ok && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">Saved.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
