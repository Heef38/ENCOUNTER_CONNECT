'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { drainOutboxNow } from '@/lib/notifications/drain-action';

export function DrainButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setReport(null);
          startTransition(async () => {
            const result = await drainOutboxNow();
            if (result.ok) {
              setReport(
                `Sent ${result.sent ?? 0} · failed ${result.failed ?? 0} · skipped ${result.skipped ?? 0}`,
              );
              router.refresh();
            } else {
              setReport(result.error ?? 'Drain failed.');
            }
          });
        }}
      >
        <Send className="h-3.5 w-3.5" />
        {pending ? 'Sending…' : 'Send pending now'}
      </Button>
      {report && <span className="text-xs text-foreground-muted">{report}</span>}
    </div>
  );
}
