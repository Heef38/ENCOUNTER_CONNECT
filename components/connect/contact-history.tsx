import { listTouches, touchLabel } from '@/lib/connect/pipeline';
import { formatShortDateTimeInZone } from '@/lib/time/zoned';
import { LogContactButton } from './log-contact-button';

/** Contact history with the one-tap logger. Staff pages only. */
export async function ContactHistory({ participantId, name, timeZone }: { participantId: string; name: string; timeZone: string }) {
  const touches = await listTouches(participantId);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-foreground">Contact</h2>
        <LogContactButton participantId={participantId} name={name} />
      </div>
      {touches.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nobody has reached out yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {touches.map((t) => (
            <li key={t.id} className="px-4 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">
                  {touchLabel(t.kind)}
                  {t.source === 'system' && <span className="ml-1 text-xs font-normal text-foreground-subtle">(automatic)</span>}
                </span>
                <span className="text-xs text-foreground-subtle">
                  {formatShortDateTimeInZone(t.occurred_at, timeZone)}
                  {t.created_by_name ? ` · ${t.created_by_name}` : ''}
                </span>
              </div>
              {t.summary && <p className="mt-0.5 whitespace-pre-wrap text-foreground-muted">{t.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
