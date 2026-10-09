import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { StartStep } from '@/lib/church/getting-started';

export function GettingStarted({ steps, publicUrl }: { steps: StartStep[]; publicUrl: string | null }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-foreground">Getting started</h2>
          <span className="text-xs text-foreground-subtle">
            {done} of {steps.length} done
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="flex items-start gap-2 rounded-md border border-border p-3 transition-colors hover:border-border-strong"
              >
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-success" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 flex-none text-foreground-subtle" />
                )}
                <span>
                  <span className={s.done ? 'text-sm text-foreground-muted line-through' : 'text-sm font-medium text-foreground'}>
                    {s.title}
                  </span>
                  {!s.done && <span className="block text-xs text-foreground-muted">{s.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {publicUrl && (
          <p className="text-xs text-foreground-subtle">
            Your public page, for Sunday&apos;s slides and the welcome table:{' '}
            <Link href="/settings/church/qr" className="text-primary hover:underline">
              {publicUrl}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
