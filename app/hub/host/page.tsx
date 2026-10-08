import Link from 'next/link';
import { requireAuth } from '@/lib/auth/dal';
import { canHostEvents } from '@/lib/events/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * How hosting works, for someone who can't host yet. Trust-then-verify:
 * once a person has met with their connector at this church and done the
 * short host orientation, they publish straight away. An admin can also
 * mark anyone a trusted host.
 */
export default async function HowHostingWorksPage() {
  await requireAuth();
  const canHost = await canHostEvents();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Hosting a gathering</h1>
      {canHost ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm text-foreground">You can host. Put something on the calendar whenever you&apos;re ready.</p>
            <Link href="/hub/new">
              <Button>Host a gathering</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm text-foreground">
            <p>Anyone at your church can host a home group, a prayer night, or a get-together. Two things first:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Meet with your connector. Your church will set it up if it hasn&apos;t already.</li>
              <li>
                Watch the five-minute host orientation in{' '}
                <Link href="/learn" className="font-medium text-primary hover:underline">
                  Learn
                </Link>
                .
              </li>
            </ol>
            <p className="text-foreground-muted">If you think you should be able to host already, ask someone on staff. They can mark you a trusted host.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
