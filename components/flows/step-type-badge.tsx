import type { FlowStepType } from '@/lib/flows/types';
import { Badge } from '@/components/ui/badge';

const CONFIG: Record<FlowStepType, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'primary' }> = {
  manual:       { label: 'Manual',           tone: 'neutral' },
  video:        { label: 'Video',            tone: 'info' },
  schedule:     { label: 'Schedule Meeting', tone: 'info' },
  event:        { label: 'Event',            tone: 'primary' },
  conversation: { label: 'Conversation',     tone: 'success' },
  assessment:   { label: 'Assessment',       tone: 'warning' },
};

export default function StepTypeBadge({ type }: { type: FlowStepType }) {
  const config = CONFIG[type] ?? { label: type, tone: 'neutral' as const };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
