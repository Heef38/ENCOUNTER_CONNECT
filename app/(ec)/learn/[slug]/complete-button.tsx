'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setLessonComplete } from '@/lib/learn/actions';

export function CompleteButton({ lessonId, done, unlocksHosting }: { lessonId: string; done: boolean; unlocksHosting: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant={done ? 'outline' : 'primary'}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await setLessonComplete(lessonId, !done);
            if (r.success) router.refresh();
            else setError(r.error);
          })
        }
      >
        <CheckCircle2 className="mr-1.5 h-4 w-4" />
        {done ? 'Marked done (undo)' : unlocksHosting ? "I've done the orientation" : 'Mark as done'}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
