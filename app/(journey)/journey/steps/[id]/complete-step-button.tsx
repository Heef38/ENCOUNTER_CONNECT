'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  action: () => Promise<void>;
  label: string;
  /** Where to go after the step is marked complete. */
  nextHref: string;
}

export function CompleteStepButton({ action, label, nextHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        // Brief confirmation moment, then flow into the next step.
        setDone(true);
        setTimeout(() => {
          router.push(nextHref);
          router.refresh();
        }, 850);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending || done}
        onClick={handleClick}
      >
        {done ? (
          <>
            <Check className="h-4 w-4" />
            Nice work!
          </>
        ) : pending ? (
          'Saving…'
        ) : (
          <>
            {label}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
