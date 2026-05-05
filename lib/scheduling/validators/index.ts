// REUSABLE CORE
import type {
  CreateBookingInput,
  CreateResourceInput,
  CreateAppointmentTypeInput,
  CreateAvailabilityRuleInput,
} from '../types';

export function validateCreateBooking(input: CreateBookingInput): string[] {
  const errors: string[] = [];
  if (!input.appointment_type_id) errors.push('appointment_type_id is required');
  if (!input.starts_at)           errors.push('starts_at is required');
  if (isNaN(Date.parse(input.starts_at))) errors.push('starts_at must be a valid date');
  if (input.attendees) {
    input.attendees.forEach((a, i) => {
      if (!a.display_name) errors.push(`attendees[${i}].display_name is required`);
    });
  }
  return errors;
}

export function validateCreateResource(input: CreateResourceInput): string[] {
  const errors: string[] = [];
  if (!input.name) errors.push('name is required');
  if (input.default_capacity !== undefined && input.default_capacity < 1) {
    errors.push('default_capacity must be at least 1');
  }
  return errors;
}

export function validateCreateAppointmentType(input: CreateAppointmentTypeInput): string[] {
  const errors: string[] = [];
  if (!input.name) errors.push('name is required');
  if (!input.duration_minutes || input.duration_minutes <= 0) {
    errors.push('duration_minutes must be positive');
  }
  return errors;
}

export function validateAvailabilityRule(input: CreateAvailabilityRuleInput): string[] {
  const errors: string[] = [];
  const ruleType = input.rule_type ?? 'recurring';

  if (!input.resource_id) errors.push('resource_id is required');
  if (!input.start_time)  errors.push('start_time is required');
  if (!input.end_time)    errors.push('end_time is required');
  if (input.start_time && input.end_time && input.start_time >= input.end_time) {
    errors.push('end_time must be after start_time');
  }

  if (ruleType === 'recurring') {
    if (input.day_of_week === undefined || input.day_of_week === null) {
      errors.push('day_of_week is required for recurring rules');
    } else if (input.day_of_week < 0 || input.day_of_week > 6) {
      errors.push('day_of_week must be between 0 and 6');
    }
  }

  if (ruleType === 'date_specific') {
    if (!input.effective_from)  errors.push('effective_from (start date) is required for date-specific rules');
    if (!input.effective_until) errors.push('effective_until (end date) is required for date-specific rules');
    if (input.effective_from && input.effective_until && input.effective_from > input.effective_until) {
      errors.push('effective_until must be on or after effective_from');
    }
  }

  return errors;
}
