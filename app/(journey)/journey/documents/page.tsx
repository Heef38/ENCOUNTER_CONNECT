import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText, NotebookPen } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { loadParticipantJourney } from '@/lib/journey/queries';

export default async function JourneyDocumentsPage() {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const participant = await loadParticipantJourney(supabase, session.id);
  if (!participant) redirect('/journey');

  const admin = await createServiceRoleClient();
  const { data: pRow } = await admin
    .from('participants')
    .select('church_id, campus_id')
    .eq('id', participant.id)
    .maybeSingle();
  const churchId = (pRow as { church_id: string } | null)?.church_id ?? null;
  const campusId = (pRow as { campus_id: string | null } | null)?.campus_id ?? null;

  const [{ data: noteRows }, { data: docRows }] = await Promise.all([
    admin
      .from('participant_progress')
      .select('id, connector_notes, meeting_completed_at, flow_step:flow_steps(title)')
      .eq('participant_id', participant.id)
      .not('connector_notes', 'is', null)
      .not('meeting_completed_at', 'is', null)
      .order('meeting_completed_at', { ascending: false }),
    churchId
      ? admin
          .from('connect_docs')
          .select('id, title, description, body, file_url, campus_id, visibility')
          .eq('church_id', churchId)
          .in('visibility', ['participants', 'public'])
          .eq('is_active', true)
          .order('title')
      : Promise.resolve({ data: [] }),
  ]);

  const meetingNotes = (noteRows ?? []) as unknown as Array<{
    id: string;
    connector_notes: string | null;
    flow_step: { title: string } | null;
  }>;
  const docs = (
    (docRows ?? []) as Array<{
      id: string;
      title: string;
      description: string | null;
      body: string | null;
      file_url: string | null;
      campus_id: string | null;
    }>
  ).filter((d) => d.campus_id === null || d.campus_id === campusId);

  const empty = meetingNotes.length === 0 && docs.length === 0;

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <Link
          href="/journey/map"
          className="mb-2 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Your journey
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Your documents
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Everything shared with you along the way.
        </p>
      </div>

      {empty && (
        <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">
          No documents yet. Notes from your meetings and resources from your campus will
          appear here.
        </div>
      )}

      {meetingNotes.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <NotebookPen className="h-4 w-4" />
            Notes from your meetings
          </h2>
          {meetingNotes.map((n) => (
            <div key={n.id} className="rounded-lg border border-border bg-surface p-4">
              {n.flow_step?.title && (
                <p className="mb-1 text-xs font-medium text-foreground-subtle">{n.flow_step.title}</p>
              )}
              <p className="whitespace-pre-wrap text-base text-foreground">{n.connector_notes}</p>
            </div>
          ))}
        </section>
      )}

      {docs.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" />
            Resources
          </h2>
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-base font-semibold text-foreground">{d.title}</p>
              {d.description && (
                <p className="mt-0.5 text-sm text-foreground-muted">{d.description}</p>
              )}
              {d.body && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{d.body}</p>
              )}
              {d.file_url && (
                <a
                  href={d.file_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Open document →
                </a>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
