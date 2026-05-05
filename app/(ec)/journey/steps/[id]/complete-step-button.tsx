'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  action: () => Promise<void>;
  label: string;
}

export function CompleteStepButton({ action, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await action();
              router.push('/journey');
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
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
