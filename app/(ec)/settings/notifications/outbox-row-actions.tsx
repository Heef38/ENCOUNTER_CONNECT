'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteOutboxRow } from '@/lib/notifications/drain-action';

export function DeleteOutboxButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete from queue"
      title="Delete from queue"
      onClick={() => {
        if (!confirm('Remove this message from the queue?')) return;
        startTransition(async () => {
          await deleteOutboxRow(id);
          router.refresh();
        });
      }}
      className="rounded p-1 text-foreground-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
