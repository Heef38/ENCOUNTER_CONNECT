import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { NewParticipantForm } from '@/components/participants/new-participant-form';

export default async function NewParticipantPage() {
  await requireStaff();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/participants"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Participants
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Add Participant
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Add someone to the connection journey.
        </p>
      </div>
      <NewParticipantForm />
    </div>
  );
}
