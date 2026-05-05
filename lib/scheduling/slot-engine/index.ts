// ============================================================
// SCHEDULING CORE — Slot Engine
// REUSABLE CORE — no Supabase or app-specific imports.
// Pure date/time logic for generating and validating slots.
// ============================================================

import {
  addMinutes,
  isWithinInterval,
  areIntervalsOverlapping,
  parseISO,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
  addDays,
  getDay,
  format,
  isBefore,
  isAfter,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type {
  SchedulingAvailabilityRule,
  SchedulingBlackout,
  SchedulingAppointmentType,
  TimeSlot,
  GetAvailableSlotsInput,
} from '../types';

// Minimal booking data needed for conflict detection
export interface BookingConflictRecord {
  id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
}

// ─────────────────────────────────────────────
// CORE HELPERS
// ─────────────────────────────────────────────

/**
 * Parse an HH:MM:SS time string and apply it to a given date in a timezone.
 */
function applyTimeToDate(date: Date, timeStr: string, timezone: string): Date {
  const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
  const zoned = toZonedTime(date, timezone);
  const withTime = setMilliseconds(
    setSeconds(setMinutes(setHours(startOfDay(zoned), hours), minutes), seconds),
    0
  );
  return fromZonedTime(withTime, timezone);
}

/**
 * Check if two intervals overlap (exclusive of touching endpoints).
 */
function intervalsOverlap(
  aStart: Date, aEnd: Date,
  bStart: Date, bEnd: Date
): boolean {
  return areIntervalsOverlapping(
    { start: aStart, end: aEnd },
    { start: bStart, end: bEnd },
    { inclusive: false }
  );
}

// ─────────────────────────────────────────────
// AVAILABILITY CHECK
// ─────────────────────────────────────────────

/**
 * Given availability rules for a resource, determine if a proposed
 * start/end window is within any active rule for that day.
 * Handles both 'recurring' (day-of-week) and 'date_specific' rules.
 */
export function isWithinAvailability(
  proposedStart: Date,
  proposedEnd: Date,
  rules: SchedulingAvailabilityRule[]
): boolean {
  const dayOfWeek = getDay(proposedStart);

  const applicableRules = rules.filter((r) => {
    if (!r.is_active) return false;
    const ruleType = r.rule_type ?? 'recurring';

    if (ruleType === 'recurring') {
      return (
        r.day_of_week === dayOfWeek &&
        (!r.effective_from || !isBefore(proposedStart, parseISO(r.effective_from))) &&
        (!r.effective_until || !isAfter(proposedEnd, parseISO(r.effective_until + 'T23:59:59')))
      );
    }

    // date_specific: proposedStart must fall within effective_from..effective_until
    if (ruleType === 'date_specific') {
      return (
        r.effective_from != null &&
        r.effective_until != null &&
        !isBefore(proposedStart, parseISO(r.effective_from)) &&
        !isAfter(proposedStart, parseISO(r.effective_until + 'T23:59:59'))
      );
    }

    return false;
  });

  return applicableRules.some((rule) => {
    const windowStart = applyTimeToDate(proposedStart, rule.start_time, rule.timezone);
    const windowEnd   = applyTimeToDate(proposedStart, rule.end_time, rule.timezone);
    return (
      !isBefore(proposedStart, windowStart) &&
      !isAfter(proposedEnd, windowEnd)
    );
  });
}

// ─────────────────────────────────────────────
// BLACKOUT CHECK
// ─────────────────────────────────────────────

/**
 * Returns true if the proposed window overlaps any active blackout.
 */
export function isBlackedOut(
  proposedStart: Date,
  proposedEnd: Date,
  blackouts: SchedulingBlackout[]
): boolean {
  return blackouts.some((b) => {
    if (!b.is_active) return false;
    return intervalsOverlap(
      proposedStart, proposedEnd,
      parseISO(b.starts_at), parseISO(b.ends_at)
    );
  });
}

// ─────────────────────────────────────────────
// CONFLICT CHECK
// ─────────────────────────────────────────────

export interface ConflictCheckInput {
  proposedStart: Date;
  proposedEnd: Date;
  resourceId: string;
  excludeBookingId?: string; // for rescheduling
  existingBookings: BookingConflictRecord[];
  capacity: number;
}

/**
 * Returns the number of concurrent bookings in the proposed window.
 * A conflict exists when concurrent bookings >= capacity.
 */
export function countConflicts(input: ConflictCheckInput): number {
  const { proposedStart, proposedEnd, resourceId, excludeBookingId, existingBookings } = input;
  return existingBookings.filter((b) => {
    if (b.id === excludeBookingId) return false;
    if (b.resource_id !== resourceId) return false;
    if (['cancelled', 'rescheduled', 'no_show'].includes(b.status)) return false;
    return intervalsOverlap(
      proposedStart, proposedEnd,
      parseISO(b.starts_at), parseISO(b.ends_at)
    );
  }).length;
}

export function hasConflict(input: ConflictCheckInput): boolean {
  return countConflicts(input) >= input.capacity;
}

// ─────────────────────────────────────────────
// BOOKING WINDOW CHECK
// ─────────────────────────────────────────────

export interface BookingWindowCheckInput {
  proposedStart: Date;
  now: Date;
  appointmentType: Pick<
    SchedulingAppointmentType,
    'min_notice_hours' | 'max_advance_days'
  >;
}

export function isWithinBookingWindow(input: BookingWindowCheckInput): {
  valid: boolean;
  reason?: string;
} {
  const { proposedStart, now, appointmentType } = input;
  if (appointmentType.min_notice_hours !== null) {
    const minStart = addMinutes(now, appointmentType.min_notice_hours * 60);
    if (isBefore(proposedStart, minStart)) {
      return {
        valid: false,
        reason: `Booking requires at least ${appointmentType.min_notice_hours} hours notice.`,
      };
    }
  }
  if (appointmentType.max_advance_days !== null) {
    const maxStart = addDays(now, appointmentType.max_advance_days);
    if (isAfter(proposedStart, maxStart)) {
      return {
        valid: false,
        reason: `Booking cannot be more than ${appointmentType.max_advance_days} days in advance.`,
      };
    }
  }
  return { valid: true };
}

// ─────────────────────────────────────────────
// SLOT GENERATOR
// ─────────────────────────────────────────────

export interface GenerateSlotsInput {
  appointmentType: SchedulingAppointmentType;
  resource: { id: string; timezone: string; default_capacity: number };
  availabilityRules: SchedulingAvailabilityRule[];
  blackouts: SchedulingBlackout[];
  existingBookings: BookingConflictRecord[];
  dateFrom: Date;
  dateTo: Date;
  now?: Date;
}

/**
 * Generates all candidate time slots for a resource over a date range.
 * Slots are generated at duration_minutes intervals within each availability window.
 * Buffers are included in the occupied window check but not shown to the end user.
 */
export function generateAvailableSlots(input: GenerateSlotsInput): TimeSlot[] {
  const {
    appointmentType,
    resource,
    availabilityRules,
    blackouts,
    existingBookings,
    dateFrom,
    dateTo,
    now = new Date(),
  } = input;

  const slots: TimeSlot[] = [];
  const stepMinutes = appointmentType.duration_minutes;
  const bufferBefore = appointmentType.buffer_before_minutes;
  const bufferAfter  = appointmentType.buffer_after_minutes;
  const timezone = resource.timezone;

  // Iterate day by day
  let currentDay = startOfDay(toZonedTime(dateFrom, timezone));
  const lastDay = startOfDay(toZonedTime(dateTo, timezone));

  while (!isAfter(currentDay, lastDay)) {
    const dayOfWeek = getDay(currentDay);
    const currentDayUtc = fromZonedTime(currentDay, timezone);

    // Match recurring rules by day-of-week + effective date range
    // Match date_specific rules where currentDay falls within effective_from..effective_until
    const todayRules = availabilityRules.filter((r) => {
      if (!r.is_active) return false;
      const ruleType = r.rule_type ?? 'recurring';
      if (ruleType === 'recurring') {
        return r.day_of_week === dayOfWeek;
      }
      if (ruleType === 'date_specific') {
        return (
          r.effective_from != null &&
          r.effective_until != null &&
          !isBefore(currentDay, parseISO(r.effective_from)) &&
          !isAfter(currentDay, parseISO(r.effective_until + 'T23:59:59'))
        );
      }
      return false;
    });

    for (const rule of todayRules) {
      const ruleType = rule.rule_type ?? 'recurring';
      // For recurring rules: enforce effective date range
      if (ruleType === 'recurring') {
        if (rule.effective_from && isBefore(currentDay, parseISO(rule.effective_from))) continue;
        if (rule.effective_until && isAfter(currentDay, parseISO(rule.effective_until + 'T23:59:59'))) continue;
      }

      const windowStart = applyTimeToDate(currentDayUtc, rule.start_time, timezone);
      const windowEnd   = applyTimeToDate(currentDayUtc, rule.end_time, timezone);

      let slotStart = windowStart;
      while (true) {
        const slotEnd = addMinutes(slotStart, stepMinutes);
        if (isAfter(slotEnd, windowEnd)) break;

        // Respect booking window
        const windowCheck = isWithinBookingWindow({
          proposedStart: slotStart,
          now,
          appointmentType,
        });

        // The "occupied" window includes buffers for conflict detection
        const occupiedStart = addMinutes(slotStart, -bufferBefore);
        const occupiedEnd   = addMinutes(slotEnd, bufferAfter);

        const blackedOut = isBlackedOut(occupiedStart, occupiedEnd, blackouts);
        const conflictCount = countConflicts({
          proposedStart: occupiedStart,
          proposedEnd: occupiedEnd,
          resourceId: resource.id,
          existingBookings,
          capacity: resource.default_capacity,
        });
        const capacityRemaining = resource.default_capacity - conflictCount;
        const available =
          windowCheck.valid &&
          !blackedOut &&
          capacityRemaining > 0;

        // Only emit slots within the requested dateFrom/dateTo range
        if (!isBefore(slotStart, dateFrom) && !isAfter(slotEnd, dateTo)) {
          slots.push({
            starts_at: slotStart,
            ends_at: slotEnd,
            resource_id: resource.id,
            available,
            capacity_remaining: Math.max(0, capacityRemaining),
          });
        }

        slotStart = addMinutes(slotStart, stepMinutes);
      }
    }

    currentDay = addDays(currentDay, 1);
  }

  return slots;
}

// ─────────────────────────────────────────────
// COMPUTE ENDS_AT
// ─────────────────────────────────────────────

export function computeEndsAt(
  startsAt: Date,
  appointmentType: Pick<SchedulingAppointmentType, 'duration_minutes'>
): Date {
  return addMinutes(startsAt, appointmentType.duration_minutes);
}

// ─────────────────────────────────────────────
// FORMAT HELPERS (for UI display)
// ─────────────────────────────────────────────

export function formatSlotLabel(slot: TimeSlot): string {
  return format(slot.starts_at, 'h:mm a');
}

export function formatSlotRange(slot: TimeSlot): string {
  return `${format(slot.starts_at, 'h:mm a')} – ${format(slot.ends_at, 'h:mm a')}`;
}
