'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { seedTestChurch, wipeTestChurch } from '@/lib/testing/test-data';
import type { SeedResult, WipeResult } from '@/lib/testing/test-data';

interface Props {
  exists: boolean;
}

export function TestDataButtons({ exists }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const handleSeed = () => {
    setMessage(null);
    startTransition(async () => {
      const r: SeedResult = await seedTestChurch();
      if (r.ok) {
        setMessage({ tone: 'ok', text: 'Test church seeded.' });
        router.refresh();
      } else {
        setMessage({ tone: 'err', text: r.error ?? 'Seed failed.' });
      }
    });
  };

  const handleWipe = () => {
    if (
      !confirm(
        'Wipe the test church? This deletes the test church, every test auth user, and all their data. This cannot be undone.',
      )
    ) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const r: WipeResult = await wipeTestChurch();
      if (r.ok) {
        setMessage({
          tone: 'ok',
          text: `Wiped. Removed ${r.removed?.authUsers ?? 0} auth users${
            r.removed?.churchDeleted ? ' and the church row' : ''
          }.`,
        });
        router.refresh();
      } else {
        setMessage({ tone: 'err', text: r.error ?? 'Wipe failed.' });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!exists ? (
          <Button type="button" size="md" disabled={pending} onClick={handleSeed}>
            {pending ? 'Seeding…' : 'Seed test church'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="md"
            disabled={pending}
            onClick={handleWipe}
          >
            {pending ? 'Wiping…' : 'Wipe test church'}
          </Button>
        )}
      </div>
      {message && (
        <p
          className={
            message.tone === 'ok'
              ? 'text-sm text-success'
              : 'text-sm text-danger'
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
