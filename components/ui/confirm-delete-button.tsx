'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  action: () => Promise<unknown>;
  message?: string;
  label?: string;
}

export function ConfirmDeleteButton({
  action,
  message = 'Delete this item? This cannot be undone.',
  label = 'Delete',
}: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(message)) return;
        startTransition(() => {
          action();
        });
      }}
    >
      {pending ? 'Deleting…' : label}
    </Button>
  );
}
