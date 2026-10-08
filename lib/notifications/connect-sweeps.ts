import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTemplate, render } from './enqueue';
import { getPipeline, summarize, type PipelineRow } from '@/lib/connect/pipeline';
import { DEFAULT_CHURCH_SETTINGS, type ChurchSettings } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import { siteUrl } from '@/lib/site';
import { formatShortDateTimeInZone, isValidTimeZone } from '@/lib/time/zoned';

/**
 * The connect ministry's two scheduled sweeps, both driven by the pipeline
 * rule (ec_connect_pipeline) so they agree with the This week console.
 *
 *   enqueueContactNudges: someone signed up and nobody has reached out
 *   within the church's window. Their connector is nudged first; if the
 *   connector still hasn't acted after admin_escalation_days, the campus
 *   admin is nudged (answer to rethink §12 Q8). With no connector at all,
 *   the admin hears straight away. Each nudge is sent once per person.
 *
 *   enqueueWeeklyDigests: the Monday email to admins, on the day each
 *   church picks, in its own timezone. A quiet week says so at most once
 *   every three weeks rather than sending zeros.
 *
 * Staff emails only. Staff texts are not part of these sweeps.
 */

const DAY_MS = 864e5;

interface ChurchRow {
  id: string;
  name: string;
  connect_name: string | null;
  timezone: string;
  slug: string | null;
}

interface StaffRecipient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string;
  campus_id: string | null;
}

async function activeChurches(admin: SupabaseClient): Promise<Array<ChurchRow & { settings: ChurchSettings }>> {
  const [{ data: churches }, { data: settings }] = await Promise.all([
    admin.from('churches').select('id, name, connect_name, timezone, slug').eq('is_active', true),
    admin.from('church_settings').select('*'),
  ]);
  const byChurch = new Map(((settings ?? []) as Array<ChurchSettings & { church_id: string }>).map((s) => [s.church_id, s]));
  return ((churches ?? []) as ChurchRow[])
    .filter((c) => c.slug !== 'test-church' || process.env.SWEEP_TEST_CHURCH === '1')
    .map((c) => ({
      ...c,
      timezone: isValidTimeZone(c.timezone) ? c.timezone : 'America/Chicago',
      settings: { ...DEFAULT_CHURCH_SETTINGS, ...(byChurch.get(c.id) ?? {}) },
    }));
}

async function churchAdmins(admin: SupabaseClient, churchId: string): Promise<StaffRecipient[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, role, campus_id')
    .eq('church_id', churchId)
    .in('role', ['church_admin', 'campus_admin']);
  return ((data ?? []) as StaffRecipient[]).filter((p) => p.email);
}

// ── Nudges ─────────────────────────────────────────────────────

export interface NudgeReport {
  churches: number;
  connectorNudges: number;
  adminNudges: number;
  skipped: number;
}

export async function enqueueContactNudges(admin: SupabaseClient, now = new Date()): Promise<NudgeReport> {
  const report: NudgeReport = { churches: 0, connectorNudges: 0, adminNudges: 0, skipped: 0 };

  for (const church of await activeChurches(admin)) {
    report.churches += 1;
    const pipeline = await getPipeline(church.id, { client: admin });
    const waiting = pipeline.filter((r) => r.flags.includes('needs_contact'));
    if (waiting.length === 0) continue;

    const admins = await churchAdmins(admin, church.id);
    const [connectorTpl, adminTpl] = await Promise.all([
      loadTemplate(admin, church.id, 'connector_contact_nudge'),
      loadTemplate(admin, church.id, 'admin_contact_escalation'),
    ]);
    const name = connectName(church);

    // Connector contacts for the waiting people.
    const connectorIds = Array.from(new Set(waiting.map((w) => w.assigned_connector_id).filter((x): x is string => !!x)));
    const connectorEmail = new Map<string, { email: string; first_name: string; last_name: string }>();
    if (connectorIds.length) {
      const { data } = await admin
        .from('connectors')
        .select('id, profile:profiles!connectors_profile_id_fkey(first_name, last_name, email)')
        .in('id', connectorIds);
      for (const c of (data ?? []) as unknown as Array<{ id: string; profile: { first_name: string; last_name: string; email: string | null } | null }>) {
        if (c.profile?.email) connectorEmail.set(c.id, { email: c.profile.email, first_name: c.profile.first_name, last_name: c.profile.last_name });
      }
    }

    // When was each connector nudge sent? (Escalation clock.)
    const { data: priorNudges } = await admin
      .from('notification_outbox')
      .select('idempotency_key, created_at')
      .in('idempotency_key', waiting.map((w) => `nudge:connector:${w.participant_id}`));
    const nudgedAt = new Map(((priorNudges ?? []) as Array<{ idempotency_key: string; created_at: string }>).map((n) => [n.idempotency_key, new Date(n.created_at).getTime()]));

    const rows: Record<string, unknown>[] = [];
    const varsFor = (p: PipelineRow) => ({
      participant_name: `${p.first_name} ${p.last_name}`.trim(),
      days_waiting: String(p.days_since_signup),
      participant_url: `${siteUrl()}/participants/${p.participant_id}`,
    });

    for (const p of waiting) {
      const connector = p.assigned_connector_id ? connectorEmail.get(p.assigned_connector_id) : undefined;
      const key = `nudge:connector:${p.participant_id}`;

      if (connector && connectorTpl) {
        if (!nudgedAt.has(key)) {
          const vars = { ...varsFor(p), recipient_first_name: connector.first_name, participant_url: `${siteUrl()}/connector/participants/${p.participant_id}` };
          rows.push({
            church_id: church.id,
            participant_id: p.participant_id,
            template_key: 'connector_contact_nudge',
            channel: 'email',
            recipient_email: connector.email,
            recipient_name: `${connector.first_name} ${connector.last_name}`.trim(),
            subject: connectorTpl.subject ? render(connectorTpl.subject, vars) : null,
            body: render(connectorTpl.body, vars),
            status: 'pending',
            metadata: { trigger: 'contact_nudge', connector_id: p.assigned_connector_id },
            idempotency_key: key,
          });
          report.connectorNudges += 1;
          continue;
        }
        // Escalate only after the connector has had their window.
        const since = now.getTime() - (nudgedAt.get(key) as number);
        if (since < church.settings.admin_escalation_days * DAY_MS) {
          report.skipped += 1;
          continue;
        }
      }

      if (!adminTpl) continue;
      // Campus admins of the person's campus first; church admins otherwise.
      const campusAdmins = admins.filter((a) => a.role === 'campus_admin' && a.campus_id && a.campus_id === p.campus_id);
      const recipients = campusAdmins.length ? campusAdmins : admins.filter((a) => a.role === 'church_admin');
      const reason = connector
        ? `${connector.first_name} was nudged ${church.settings.admin_escalation_days}+ days ago.`
        : 'Nobody is assigned as their connector yet.';
      for (const a of recipients) {
        const vars = { ...varsFor(p), recipient_first_name: a.first_name, escalation_reason: reason };
        rows.push({
          church_id: church.id,
          participant_id: p.participant_id,
          template_key: 'admin_contact_escalation',
          channel: 'email',
          recipient_email: a.email,
          recipient_name: `${a.first_name} ${a.last_name}`.trim(),
          subject: adminTpl.subject ? render(adminTpl.subject, vars) : null,
          body: render(adminTpl.body, vars),
          status: 'pending',
          metadata: { trigger: 'contact_escalation', recipient_profile_id: a.id },
          idempotency_key: `nudge:admin:${p.participant_id}:${a.id}`,
        });
        report.adminNudges += 1;
      }
    }

    if (rows.length) {
      await admin.from('notification_outbox').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
    }
    void name;
  }
  return report;
}

// ── The Monday digest ──────────────────────────────────────────

export interface DigestReport {
  churches: number;
  sent: number;
  quietSkipped: number;
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekdayIn(now: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

const listNames = (rows: PipelineRow[], n = 8) =>
  rows
    .slice(0, n)
    .map((r) => `  - ${r.first_name} ${r.last_name} (${r.days_since_signup} days${r.connector_name ? `, ${r.connector_name}` : ', no connector'})`)
    .join('\n') + (rows.length > n ? `\n  - and ${rows.length - n} more` : '');

export async function enqueueWeeklyDigests(admin: SupabaseClient, now = new Date(), opts: { force?: boolean } = {}): Promise<DigestReport> {
  const report: DigestReport = { churches: 0, sent: 0, quietSkipped: 0 };

  for (const church of await activeChurches(admin)) {
    if (!church.settings.digest_enabled) continue;
    if (!opts.force && weekdayIn(now, church.timezone) !== church.settings.digest_day_of_week) continue;
    report.churches += 1;

    const pipeline = await getPipeline(church.id, { client: admin });
    const s = summarize(pipeline);
    const weekEnd = new Date(now.getTime() + 7 * DAY_MS).toISOString();

    const [{ data: gatherings }, { count: reported }] = await Promise.all([
      admin
        .from('events')
        .select('id, title, starts_at, timezone')
        .eq('church_id', church.id)
        .eq('status', 'published')
        .gte('starts_at', now.toISOString())
        .lt('starts_at', weekEnd)
        .order('starts_at')
        .limit(20),
      admin
        .from('event_reports')
        .select('id, event:events!inner ( church_id )', { count: 'exact', head: true })
        .eq('event.church_id', church.id)
        .is('resolved_at', null),
    ]);
    const events = (gatherings ?? []) as Array<{ id: string; title: string; starts_at: string; timezone: string }>;

    const quiet =
      s.newThisWeek === 0 &&
      s.buckets.needs_contact.length === 0 &&
      s.buckets.unassigned.length === 0 &&
      s.buckets.stalled.length === 0 &&
      events.length === 0 &&
      (reported ?? 0) === 0;

    if (quiet) {
      const { data: recentQuiet } = await admin
        .from('notification_outbox')
        .select('id')
        .eq('church_id', church.id)
        .eq('template_key', 'admin_weekly_digest')
        .contains('metadata', { quiet: true })
        .gte('created_at', new Date(now.getTime() - 21 * DAY_MS).toISOString())
        .limit(1);
      if ((recentQuiet ?? []).length > 0) {
        report.quietSkipped += 1;
        continue;
      }
    }

    const parts: string[] = [];
    if (quiet) {
      parts.push(
        'A quiet week: nobody new, nobody waiting, nothing on the calendar.',
        church.slug ? `Your public page and QR link: ${siteUrl()}/c/${church.slug}` : '',
      );
    } else {
      parts.push(
        `${s.newThisWeek} new this week. ${s.counts.contacted} contacted, ${s.counts.met} met, ${s.counts.plugged_in} at a table, ${s.counts.serving} serving.`,
      );
      if (s.buckets.needs_contact.length) {
        parts.push(`Nobody has reached out yet (${s.buckets.needs_contact.length}):\n${listNames(s.buckets.needs_contact)}`);
      }
      if (s.buckets.unassigned.length) parts.push(`No connector yet: ${s.buckets.unassigned.length}.`);
      if (s.buckets.stalled.length) parts.push(`Gone quiet for two weeks: ${s.buckets.stalled.length}.`);
      if (s.buckets.needs_table.length) parts.push(`Not at a table yet: ${s.buckets.needs_table.length}.`);
      if (events.length) {
        parts.push(
          `This week's gatherings (${events.length}):\n` +
            events
              .slice(0, 8)
              .map((e) => `  - ${e.title}, ${formatShortDateTimeInZone(e.starts_at, e.timezone)}`)
              .join('\n'),
        );
      }
      if ((reported ?? 0) > 0) parts.push(`${reported} reported gathering${reported === 1 ? '' : 's'} to review: ${siteUrl()}/hub/review`);
    }

    const headline = quiet
      ? 'a quiet week'
      : s.buckets.needs_contact.length
        ? `${s.buckets.needs_contact.length} waiting to hear from someone`
        : `${s.newThisWeek} new, ${events.length} gathering${events.length === 1 ? '' : 's'}`;

    const tpl = await loadTemplate(admin, church.id, 'admin_weekly_digest');
    if (!tpl) continue;
    const week = isoWeek(now);
    const rows = (await churchAdmins(admin, church.id)).map((a) => {
      const vars = {
        recipient_first_name: a.first_name,
        headline,
        digest_body: parts.filter(Boolean).join('\n\n'),
        dashboard_url: `${siteUrl()}/dashboard`,
      };
      return {
        church_id: church.id,
        template_key: 'admin_weekly_digest',
        channel: 'email',
        recipient_email: a.email,
        recipient_name: `${a.first_name} ${a.last_name}`.trim(),
        subject: tpl.subject ? render(tpl.subject, vars) : null,
        body: render(tpl.body, vars),
        status: 'pending',
        metadata: { trigger: 'weekly_digest', week, quiet, recipient_profile_id: a.id },
        idempotency_key: `digest:${church.id}:${week}:${a.id}`,
      };
    });
    if (rows.length) {
      await admin.from('notification_outbox').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      report.sent += rows.length;
    }
  }
  return report;
}
