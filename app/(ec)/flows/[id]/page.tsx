import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFlow } from '@/lib/flows/services';
import FlowStepList from '@/components/flows/flow-step-list';
import { EditFlowDetails } from '@/components/flows/edit-flow-details';
import { requireStaff } from '@/lib/auth/dal';

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [flowResult, { data: appointmentTypes }] = await Promise.all([
    getFlow(supabase, id),
    supabase
      .from('scheduling_appointment_types')
      .select('id, name, duration_minutes')
      .eq('is_active', true)
      .order('name'),
  ]);

  if (!flowResult.success) notFound();
  const flow = flowResult.data;

  const [{ data: lessons }, { data: campuses }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, video_url')
      .eq('church_id', flow.church_id)
      .order('order_index'),
    supabase
      .from('campuses')
      .select('id, name')
      .eq('church_id', flow.church_id)
      .eq('is_active', true)
      .order('name'),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/flows"
        className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Flows
      </Link>

      <EditFlowDetails flow={flow} campuses={campuses ?? []} />

      <FlowStepList
        flowId={flow.id}
        initialSteps={flow.steps}
        appointmentTypes={appointmentTypes ?? []}
        lessons={lessons ?? []}
      />
    </div>
  );
}
