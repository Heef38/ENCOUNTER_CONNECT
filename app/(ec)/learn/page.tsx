import Link from 'next/link';
import { CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { listLibrary } from '@/lib/learn/queries';
import { canHostEvents } from '@/lib/events/actions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const PURPOSE_LABEL: Record<string, string> = {
  host_orientation: 'For hosts',
  connector: 'For connectors',
  leader: 'For group leaders',
  journey: 'Journey',
  general: '',
};

/**
 * Learn: short lessons anyone at the church can take, whether or not the
 * church runs a journey. Host orientation sits first for anyone who can't
 * host yet, because finishing it is half of what opens hosting up.
 */
export default async function LearnPage() {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">You are not attached to a church.</p>;
  const [lessons, canHost] = await Promise.all([listLibrary(churchId, session.id), canHostEvents()]);

  const orientation = lessons.find((l) => l.purpose === 'host_orientation');
  const rest = lessons.filter((l) => l.id !== orientation?.id);

  const card = (l: (typeof lessons)[number], highlight = false) => (
    <li key={l.id}>
      <Link href={`/learn/${l.slug ?? l.id}`}>
        <Card className={highlight ? 'border-primary/60 transition-colors hover:border-primary' : 'h-full transition-colors hover:border-border-strong'}>
          <CardContent className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {PURPOSE_LABEL[l.purpose] && (
                <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground-subtle">{PURPOSE_LABEL[l.purpose]}</span>
              )}
              {l.minutes && (
                <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                  <Clock className="h-3 w-3" />
                  {l.minutes} min
                </span>
              )}
              {l.completed_at && (
                <Badge tone="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Done
                </Badge>
              )}
            </div>
            <div className="font-medium text-foreground">{l.title}</div>
            {l.summary && <p className="text-sm text-foreground-muted">{l.summary}</p>}
          </CardContent>
        </Card>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Learn</h1>
        <p className="mt-1 text-sm text-foreground-muted">Short lessons for hosting, connecting, and leading. Take them in any order.</p>
      </header>

      {orientation && !canHost && !orientation.completed_at && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            <Sparkles className="h-3.5 w-3.5" />
            Want to host? Start here
          </h2>
          <ul>{card(orientation, true)}</ul>
        </section>
      )}

      {lessons.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-muted">
          Your church hasn&apos;t added lessons yet.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(orientation && !canHost && !orientation.completed_at ? rest : lessons).map((l) => card(l))}
        </ul>
      )}
    </div>
  );
}
