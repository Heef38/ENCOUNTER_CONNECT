'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProposedSlot } from '@/lib/connectors/match';

interface Props {
  progressId: string;
  proposedSlots: ProposedSlot[];
  fallbackHref: string;
  bookAction: (startsAtIso: string) => Promise<{ ok: boolean; error?: string }>;
}

export function ConnectorSlotPicker({ proposedSlots, fallbackHref, bookAction }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  function pick(iso: string) {
    setError(null);
    setSelectedIso(iso);
    startTransition(async () => {
      const result = await bookAction(iso);
      if (!result.ok) {
        setError(result.error ?? 'Booking failed.');
        setSelectedIso(null);
        return;
      }
      router.refresh();
    });
  }

  if (proposedSlots.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 px-3 py-2 text-sm text-warning">
          No connector availability could be found in the next two weeks. Use
          the link below to pick a time manually — your campus team will follow
          up to assign someone.
        </div>
        <Link href={fallbackHref}>
          <Button variant="outline">
            <CalendarDays className="h-4 w-4" />
            See all available times
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        Pick a time that works. We&apos;ll match you with the connector who&apos;s
        free at that slot.
      </p>

      <ul className="space-y-2">
        {proposedSlots.map((slot) => {
          const start = new Date(slot.starts_at);
          const isSelected = selectedIso === slot.starts_at;
          return (
            <li key={slot.starts_at}>
              <button
                type="button"
                disabled={pending}
                onClick={() => pick(slot.starts_at)}
                className={`flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition disabled:opacity-50 ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-surface hover:border-primary/60 hover:bg-primary/5'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {start.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {start.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-foreground-subtle" />
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="border-t border-border pt-3">
        <Link
          href={fallbackHref}
          className="text-sm text-primary hover:underline"
        >
          None of these work — see all available times
        </Link>
      </div>

      {pending && (
        <p className="text-xs text-foreground-subtle">Booking your time…</p>
      )}
    </div>
  );
}
