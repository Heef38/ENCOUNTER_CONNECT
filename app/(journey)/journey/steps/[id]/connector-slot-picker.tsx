'use client';

import { useState, useTransition } from 'react';
import { ChevronRight, X } from 'lucide-react';

interface Slot {
  starts_at: string;
  ends_at: string;
}
interface ProposedSlot extends Slot {
  eligible_connector_ids: string[];
}

interface Props {
  proposedSlots: ProposedSlot[];
  /** Every available time, for the "see all" popover. */
  allSlots: Slot[];
  bookAction: (startsAtIso: string) => Promise<{ ok: boolean; error?: string }>;
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ConnectorSlotPicker({ proposedSlots, allSlots, bookAction }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  function book(iso: string) {
    setError(null);
    setSelectedIso(iso);
    startTransition(async () => {
      const result = await bookAction(iso);
      if (!result.ok) {
        setError(result.error ?? 'Booking failed.');
        setSelectedIso(null);
        return;
      }
      setShowAll(false);
      // The step page revalidates on success; nothing else to do here.
    });
  }

  // Group all slots by calendar day for the popover.
  const byDay = new Map<string, Slot[]>();
  for (const s of allSlots) {
    const key = s.starts_at.slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }

  return (
    <div className="space-y-3">
      {proposedSlots.length === 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 px-3 py-2 text-sm text-warning">
          No connector availability could be found in the next two weeks. Your campus
          team will follow up to set up a time.
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            Pick a time that works. We&apos;ll match you with the connector who&apos;s
            free then.
          </p>
          <ul className="space-y-2">
            {proposedSlots.map((slot) => {
              const isSelected = selectedIso === slot.starts_at;
              return (
                <li key={slot.starts_at}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => book(slot.starts_at)}
                    className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition disabled:opacity-50 ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-surface hover:border-primary/60 hover:bg-primary/5'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{fmtDay(slot.starts_at)}</p>
                      <p className="text-sm text-foreground-muted">{fmtTime(slot.starts_at)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-foreground-subtle" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="relative border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-sm text-primary hover:underline"
          aria-expanded={showAll}
        >
          {proposedSlots.length === 0 ? 'See available times' : 'See all available times'}
        </button>

        {showAll && (
          <div className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-full max-w-sm overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                All available times
              </span>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                aria-label="Close"
                className="rounded p-0.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {allSlots.length === 0 ? (
              <p className="px-1 py-3 text-sm text-foreground-muted">
                No times available right now.
              </p>
            ) : (
              <div className="space-y-3">
                {Array.from(byDay.values()).map((slots) => (
                  <div key={slots[0].starts_at.slice(0, 10)}>
                    <p className="mb-1 text-xs font-medium text-foreground-subtle">
                      {fmtDay(slots[0].starts_at)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((s) => (
                        <button
                          key={s.starts_at}
                          type="button"
                          disabled={pending}
                          onClick={() => book(s.starts_at)}
                          className={`rounded-md border px-2.5 py-1 text-sm transition disabled:opacity-50 ${
                            selectedIso === s.starts_at
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-surface hover:border-primary/60 hover:bg-primary/5'
                          }`}
                        >
                          {fmtTime(s.starts_at)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {pending && <p className="text-xs text-foreground-subtle">Booking your time…</p>}
    </div>
  );
}
