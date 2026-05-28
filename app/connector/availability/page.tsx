import { requireConnector } from '@/lib/auth/dal';
import { getMyAvailability } from '@/lib/connectors/availability-actions';
import { ConnectorAvailabilityEditor } from '@/components/connector/availability-editor';

export default async function ConnectorAvailabilityPage() {
  await requireConnector();
  const result = await getMyAvailability();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          My availability
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Set the times you&apos;re open to meet. Participants booking a meeting will only
          see slots inside these windows.
        </p>
      </div>

      {result.ok ? (
        <ConnectorAvailabilityEditor
          initialWindows={result.windows ?? []}
          timezone={result.timezone ?? 'America/Chicago'}
        />
      ) : (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {result.error ?? 'Could not load your availability.'}
        </div>
      )}
    </div>
  );
}
