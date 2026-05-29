'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  action: () => Promise<unknown>;
  message?: string;
  label?: string;
  /** Render a compact trash-icon button instead of a labelled button. */
  icon?: boolean;
}

export function ConfirmDeleteButton({
  action,
  message = 'Delete this item? This cannot be undone.',
  label = 'Delete',
  icon = false,
}: Props) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!confirm(message)) return;
    startTransition(() => {
      action();
    });
  };

  if (icon) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label={label}
        title={label}
        onClick={onClick}
        className={cn('text-foreground-subtle hover:text-danger', pending && 'opacity-60')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={onClick}
    >
      {pending ? 'Deleting…' : label}
    </Button>
  );
}
