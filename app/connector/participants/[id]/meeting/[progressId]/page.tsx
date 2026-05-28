import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText, ClipboardList, CalendarDays } from 'lucide-react';
import { requireConnector } from '@/lib/auth/dal';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { getConnectorParticipantAccess } from '@/lib/connectors/journey-queries';
import {
  generateOneOnOneDoc,
  type PrepResult,
} from '@/lib/connectors/prep-doc';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MeetingNotesEditor } from './meeting-notes-editor';
import type { AssessmentCategory } from '@/lib/assessments/types';

export default async function MeetingRoomPage({
  params,
}: {
  params: Promise<{ id: string; progressId: string }>;
}) {
  const { connectorId } = await requireConnector();
  const { id, progressId } = await params;
  const supabase = await createServerSupabaseClient();

  const access = await getConnectorParticipantAccess(supabase, connectorId, id);
  if (!access.canWrite) notFound();

  const admin = await createServiceRoleClient();

  const { data: prog } = await admin
    .from('participant_progress')
    .select(
      'id, participant_id, scheduled_event_id, connector_notes, meeting_started_at, meeting_completed_at, flow_step:flow_steps(title)',
    )
    .eq('id', progressId)
    .maybeSingle();
  if (!prog || prog.participant_id !== id) notFound();

  // Record the meeting start the first time the room is opened.
  if (!prog.meeting_started_at) {
    await admin
      .from('participant_progress')
      .update({ meeting_started_at: new Date().toISOString() })
      .eq('id', progressId);
  }
  const completed = !!prog.meeting_completed_at;

  const [{ data: participant }, bookingResult, { data: progressAll }, { data: resultRows }, { data: docs }] =
    await Promise.all([
      admin
        .from('participants')
        .select('id, first_name, last_name, status, signed_up_at, church_id, campus:campuses(name)')
        .eq('id', id)
        .maybeSingle(),
      prog.scheduled_event_id
        ? admin.from('scheduling_bookings').select('starts_at, status').eq('id', prog.scheduled_event_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from('participant_progress')
        .select('status, flow_step:flow_steps(title)')
        .eq('participant_id', id),
      admin
        .from('assessment_results')
        .select('assessment_id, computed_score, assessment:assessment_definitions(id, kind, name)')
        .eq('participant_id', id),
      admin
        .from('connect_docs')
        .select('id, title, description, body, file_url, church_id')
        .eq('visibility', 'staff')
        .eq('is_active', true)
        .order('title'),
    ]);

  if (!participant) notFound();
  // Scope connect docs to the participant's church (service-role bypasses RLS).
  const churchId = (participant as { church_id: string }).church_id;

  const results = ((resultRows ?? []) as unknown as PrepResult[]).filter((r) => r.assessment !== null);

  const categoriesByAssessment = new Map<string, AssessmentCategory[]>();
  if (results.length > 0) {
    const { data: cats } = await admin
      .from('assessment_categories')
      .select('*')
      .in('assessment_id', results.map((r) => r.assessment_id))
      .order('order_index');
    for (const c of (cats ?? []) as AssessmentCategory[]) {
      const list = categoriesByAssessment.get(c.assessment_id) ?? [];
      list.push(c);
      categoriesByAssessment.set(c.assessment_id, list);
    }
  }

  const prepDoc = generateOneOnOneDoc({
    participant: participant as never,
    progress: (progressAll ?? []) as never,
    results,
    categoriesByAssessment,
  });

  const bookingStartsAt = (bookingResult.data as { starts_at: string } | null)?.starts_at ?? null;
  const staffDocs = ((docs ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    body: string | null;
    file_url: string | null;
    church_id: string;
  }>).filter((d) => d.church_id === churchId);

  return (
    <div className="space-y-6">
      <Link
        href={`/connector/participants/${id}`}
        className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        {participant.first_name} {participant.last_name}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Meeting with {participant.first_name} {participant.last_name}
        </h1>
        <Badge tone={completed ? 'success' : 'info'}>
          {completed ? 'Completed' : 'In session'}
        </Badge>
      </div>
      {bookingStartsAt && (
        <p className="-mt-3 text-sm text-foreground-muted">
          {new Date(bookingStartsAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
        </p>
      )}

      {/* Participant documents */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="h-4 w-4" />
          Participant prep & assessments
        </h2>
        <Card>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {prepDoc}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Connector prep docs */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4" />
          Connect Docs (prep material)
        </h2>
        {staffDocs.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No staff Connect Docs yet. Admins can add them under Settings → Connect Docs.
          </p>
        ) : (
          <div className="space-y-2">
            {staffDocs.map((d) => (
              <Card key={d.id}>
                <CardContent className="space-y-1 p-4">
                  <p className="text-sm font-semibold text-foreground">{d.title}</p>
                  {d.description && (
                    <p className="text-xs text-foreground-muted">{d.description}</p>
                  )}
                  {d.body && (
                    <p className="whitespace-pre-wrap text-sm text-foreground-muted">{d.body}</p>
                  )}
                  {d.file_url && (
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-block text-sm text-primary hover:underline"
                    >
                      Open attachment →
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4" />
          Meeting notes
        </h2>
        <MeetingNotesEditor
          progressId={progressId}
          participantId={id}
          initialNotes={(prog.connector_notes as string | null) ?? ''}
          completed={completed}
        />
      </section>
    </div>
  );
}
