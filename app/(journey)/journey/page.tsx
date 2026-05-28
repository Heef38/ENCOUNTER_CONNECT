import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PartyPopper, Map } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  loadParticipantJourney,
  orderedProgress,
  resolveCurrentProgressId,
} from '@/lib/journey/queries';

export default async function JourneyPage() {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const participant = await loadParticipantJourney(supabase, session.id);

  if (!participant) {
    return (
      <div className="flex flex-1 flex-col justify-center px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Welcome</h1>
        <p className="mt-3 text-sm text-foreground-muted">
          Your account isn&apos;t linked to a participant record yet. Reach out to
          your campus team so they can get you started.
        </p>
      </div>
    );
  }

  const ordered = orderedProgress(participant);

  if (ordered.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Hi, {participant.first_name}
        </h1>
        <p className="mt-3 text-sm text-foreground-muted">
          You&apos;re all signed up. Your campus team is setting up your next steps —
          check back soon.
        </p>
      </div>
    );
  }

  const currentId = resolveCurrentProgressId(ordered);
  if (currentId) {
    redirect(`/journey/steps/${currentId}`);
  }

  // Every step complete → celebration.
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-semibold text-foreground">
        You did it, {participant.first_name}!
      </h1>
      <p className="mt-3 text-sm text-foreground-muted">
        You&apos;ve completed every step of your journey. Your campus team will be in
        touch about what&apos;s next.
      </p>
      <Link
        href="/journey/map"
        className="mt-6 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Map className="h-4 w-4" />
        View your full journey
      </Link>
    </div>
  );
}
