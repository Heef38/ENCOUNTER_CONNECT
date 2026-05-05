'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, Mail, Phone, User2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { colorForEvent } from '@/lib/dashboard/colors';
import type { AppointmentRow as AppointmentRowData, BookingStatus } from '@/lib/appointments/queries';

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_confirmation: 'Pending',
  confirmed:            'Confirmed',
  cancelled:            'Cancelled',
  completed:            'Completed',
  no_show:              'No-show',
  rescheduled:          'Rescheduled',
};

function connectorChipTone(status: BookingStatus): {
  border: string;
  bg: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case 'confirmed':
      return {
        border: 'border-success/40',
        bg: 'bg-success-bg/60',
        text: 'text-success',
        dot: 'bg-success',
      };
    case 'pending_confirmation':
      return {
        border: 'border-warning/40',
        bg: 'bg-warning-bg/60',
        text: 'text-warning',
        dot: 'bg-warning',
      };
    case 'cancelled':
    case 'no_show':
      return {
        border: 'border-danger/40',
        bg: 'bg-danger-bg/60',
        text: 'text-danger',
        dot: 'bg-danger',
      };
    case 'completed':
      return {
        border: 'border-border',
        bg: 'bg-surface-muted',
        text: 'text-foreground-muted',
        dot: 'bg-foreground-subtle',
      };
    case 'rescheduled':
      return {
        border: 'border-info/40',
        bg: 'bg-info-bg/60',
        text: 'text-info',
        dot: 'bg-info',
      };
  }
}

function formatWhen(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

export function AppointmentRow({ row }: { row: AppointmentRowData }) {
  const tone = connectorChipTone(row.status);
  const { date, time } = formatWhen(row.startsAt);
  const accent = colorForEvent({
    title: row.appointmentTypeName ?? 'Appointment',
    typeColor: row.typeColor,
    displayColor: row.displayColor,
  });

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Connector chip */}
        <Tooltip
          content={
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">
                {row.connectorName ?? 'No connector assigned'}
              </div>
              <div className="text-foreground-muted">
                Status: {STATUS_LABEL[row.status]}
              </div>
              {row.connectorId && (
                <Link
                  href={`/connectors/${row.connectorId}`}
                  className="mt-1 block text-primary hover:underline"
                >
                  View connector →
                </Link>
              )}
            </div>
          }
        >
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium',
              tone.border,
              tone.bg,
              tone.text,
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
            <span className="truncate max-w-[14rem]">
              {row.connectorName ?? 'Unassigned'}
            </span>
          </div>
        </Tooltip>

        <ArrowRight className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden />

        {/* DateTime chip */}
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="font-medium text-foreground">
                {date} · {time} – {formatWhen(row.endsAt).time}
              </div>
              <div className="text-foreground-muted">
                Propose a new time <span className="text-foreground-subtle">(coming soon)</span>
              </div>
            </div>
          }
        >
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-muted/60 px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary hover:bg-surface-muted">
            <CalendarClock className="h-3.5 w-3.5 text-foreground-muted" />
            <span>
              {date} <span className="text-foreground-muted">·</span> {time}
            </span>
          </div>
        </Tooltip>

        <ArrowRight className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden />

        {/* Participant chip */}
        <Tooltip
          content={
            <div className="space-y-1.5">
              <div>
                <div className="font-medium text-foreground">
                  {row.participantName ?? 'Unknown'}
                </div>
                <div className="text-foreground-muted">
                  {row.participantStatus?.replace('_', ' ')}
                  {row.campusName && (
                    <span className="text-foreground-subtle"> · {row.campusName}</span>
                  )}
                </div>
              </div>
              {row.participantEmail && (
                <div className="flex items-center gap-1.5 text-foreground-muted">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{row.participantEmail}</span>
                </div>
              )}
              {row.participantPhone && (
                <div className="flex items-center gap-1.5 text-foreground-muted">
                  <Phone className="h-3 w-3" />
                  <span>{row.participantPhone}</span>
                </div>
              )}
              {row.currentStepTitle && (
                <div className="text-foreground-subtle">
                  Step: {row.currentStepTitle}
                </div>
              )}
              {row.participantId && (
                <Link
                  href={`/participants/${row.participantId}`}
                  className="block text-primary hover:underline"
                >
                  View participant →
                </Link>
              )}
            </div>
          }
        >
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary">
            <User2 className="h-3.5 w-3.5 text-foreground-muted" />
            <span className="truncate max-w-[14rem]">
              {row.participantName ?? 'Unknown'}
            </span>
          </div>
        </Tooltip>
      </div>

      {/* Meta footer */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
        {row.appointmentTypeName && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: accent }}
            />
            {row.appointmentTypeName}
          </span>
        )}
        {row.locationName && <span>{row.locationName}</span>}
        <Badge tone={statusBadgeTone(row.status)}>{STATUS_LABEL[row.status]}</Badge>
      </div>
    </div>
  );
}

function statusBadgeTone(
  status: BookingStatus,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'confirmed':            return 'success';
    case 'pending_confirmation': return 'warning';
    case 'cancelled':
    case 'no_show':              return 'danger';
    case 'rescheduled':          return 'info';
    case 'completed':            return 'neutral';
  }
}
