'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  action: () => Promise<void>;
  label: string;
}

/**
 * Marks the step complete and refreshes in place — the participant then moves
 * on with the next-step arrow. (Completion no longer auto-navigates.)
 */
export function CompleteStepButton({ action, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await action();
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong.');
            }
          });
        }}
      >
        <Check className="h-4 w-4" />
        {pending ? 'Saving…' : label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
