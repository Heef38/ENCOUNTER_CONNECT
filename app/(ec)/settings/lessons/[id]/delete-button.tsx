'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  action: () => Promise<void>;
  label?: string;
}

export function DeleteButton({ action, label = 'Delete' }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm('Delete this lesson? This cannot be undone.')) return;
        startTransition(() => {
          action();
        });
      }}
    >
      {pending ? 'Deleting…' : label}
    </Button>
  );
}
