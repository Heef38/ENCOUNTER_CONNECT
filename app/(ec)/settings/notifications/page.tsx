import Link from 'next/link';
import { ChevronLeft, Plus, Mail, MessageSquare } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DrainButton } from './drain-button';
import { DeleteOutboxButton } from './outbox-row-actions';
import type {
  NotificationTemplate,
  NotificationOutboxRow,
} from '@/lib/notifications/types';

const TONES: Record<NotificationOutboxRow['status'], 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  pending: 'info',
  sent:    'success',
  failed:  'danger',
  skipped: 'warning',
};

export default async function NotificationsSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const churchId = session.profile?.church_id;

  const [templatesResult, outboxResult] = await Promise.all([
    churchId
      ? supabase
          .from('notification_templates')
          .select('*')
          .eq('church_id', churchId)
          .order('key')
      : Promise.resolve({ data: [] }),
    churchId
      ? supabase
          .from('notification_outbox')
          .select(
            'id, channel, recipient_email, recipient_phone, recipient_name, subject, status, error, scheduled_for, sent_at, template_key',
          )
          .eq('church_id', churchId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const templates = (templatesResult.data ?? []) as NotificationTemplate[];
  const outbox = (outboxResult.data ?? []) as Pick<
    NotificationOutboxRow,
    | 'id'
    | 'channel'
    | 'recipient_email'
    | 'recipient_phone'
    | 'recipient_name'
    | 'subject'
    | 'status'
    | 'error'
    | 'scheduled_for'
    | 'sent_at'
    | 'template_key'
  >[];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Dashboard
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Email + SMS templates and a queue of outbound messages. The system uses these
          stable keys: <span className="font-mono">step_complete_to_connector</span>,{' '}
          <span className="font-mono">step_stale_3_day</span>,{' '}
          <span className="font-mono">step_stale_7_day</span>. Add a template with a matching
          key to override the default body.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-foreground">
            Templates ({templates.length})
          </h2>
          <Link href="/settings/notifications/new">
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5" />
              New template
            </Button>
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
            No custom templates yet. The app falls back to the built-in defaults.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH>Key</TH>
                  <TH>Name</TH>
                  <TH>Channel</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {templates.map((t) => (
                  <TR key={t.id} className="hover:bg-surface-muted/60">
                    <TD>
                      <Link
                        href={`/settings/notifications/${t.id}`}
                        className="font-mono text-xs text-foreground hover:text-primary"
                      >
                        {t.key}
                      </Link>
                    </TD>
                    <TD className="text-foreground-muted">{t.name}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                        {t.channel === 'email' ? (
                          <Mail className="h-3.5 w-3.5" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5" />
                        )}
                        {t.channel}
                      </span>
                    </TD>
                    <TD>
                      {t.is_active ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Outbox (last 50)
            </h2>
            <p className="text-xs text-foreground-subtle">
              Queue of pending and recent notifications. The cron at{' '}
              <span className="font-mono">/api/cron/notifications-send</span> drains
              this on a schedule; you can also flush manually.
            </p>
          </div>
          <DrainButton />
        </div>

        {outbox.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
            Nothing in the outbox yet. Notifications appear here when participants
            complete steps or go idle.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Recipient</TH>
                  <TH>Channel</TH>
                  <TH>Template</TH>
                  <TH>Subject</TH>
                  <TH>Status</TH>
                  <TH className="w-10" />
                </TR>
              </THead>
              <TBody>
                {outbox.map((row) => (
                  <TR key={row.id} className="hover:bg-surface-muted/60">
                    <TD className="whitespace-nowrap text-xs text-foreground-muted">
                      {new Date(row.scheduled_for).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </TD>
                    <TD className="text-foreground-muted">
                      {row.recipient_name ?? row.recipient_email ?? row.recipient_phone ?? '—'}
                    </TD>
                    <TD className="text-foreground-muted">{row.channel}</TD>
                    <TD className="font-mono text-[11px] text-foreground-subtle">
                      {row.template_key ?? '—'}
                    </TD>
                    <TD className="max-w-xs truncate text-foreground-muted">
                      {row.subject ?? '—'}
                    </TD>
                    <TD>
                      <Badge tone={TONES[row.status]}>{row.status}</Badge>
                      {row.status === 'failed' && row.error && (
                        <p className="mt-1 max-w-[16rem] text-xs text-danger" title={row.error}>
                          {row.error}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <DeleteOutboxButton id={row.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
