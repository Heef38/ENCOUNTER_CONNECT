// ============================================================
// ENCOUNTER CONNECT ADAPTER — Scheduling Core Bridge
//
// This adapter translates Encounter Connect domain concepts
// into Scheduling Core primitives.
//
// STATUS: Scaffold / typed stubs — not yet wired to live data.
// The Encounter Connect layer imports this; the core never imports it.
//
// PACKAGE BOUNDARY: This file is app-specific. It should live in
// the host app when the core is extracted into a shared package.
// ============================================================

import type {
  CreateBookingInput,
  CreateExternalRefInput,
  CreateResourceInput,
  SchedulingResourceKind,
  SchedulingRefRelationKind,
} from '../types';

// ─────────────────────────────────────────────
// ENCOUNTER CONNECT DOMAIN TYPES (stubs)
// These will be imported from the real EC types once integrated.
// ─────────────────────────────────────────────

export interface ECParticipant {
  id: string;
  display_name: string;
  email?: string;
  phone?: string;
  campus_id?: string;
}

export interface ECConnector {
  id: string;               // EC person ID
  scheduling_resource_id?: string; // linked scheduling resource
  display_name: string;
  email?: string;
  timezone?: string;
  campus_id?: string;
}

export interface ECWorkflowStep {
  id: string;
  workflow_id: string;
  name: string;
  requires_booking: boolean;
  appointment_type_slug?: string; // maps to scheduling_appointment_types.slug
}

export interface ECConnectorAssignment {
  id: string;
  participant_id: string;
  connector_id: string;
}

// ─────────────────────────────────────────────
// EXTERNAL REF BUILDERS
// These are the key integration points — how EC entities attach to bookings.
// ─────────────────────────────────────────────

/**
 * Creates an external ref that marks a participant as the primary subject of a booking.
 * Use this when a participant books a meeting or signs up for a class.
 */
export function buildParticipantRef(
  participant: Pick<ECParticipant, 'id'>,
  relation: SchedulingRefRelationKind = 'primary_subject'
): CreateExternalRefInput {
  return {
    external_type: 'encounter_participant',
    external_id: participant.id,
    relation_kind: relation,
  };
}

/**
 * Creates an external ref that gates a workflow step on a booking.
 * The EC workflow engine should check this ref before marking the step complete.
 */
export function buildWorkflowStepRef(
  step: Pick<ECWorkflowStep, 'id'>
): CreateExternalRefInput {
  return {
    external_type: 'encounter_workflow_step',
    external_id: step.id,
    relation_kind: 'workflow_gate',
  };
}

/**
 * Creates an external ref linking a booking to a connector assignment.
 * Useful for connector follow-up tracking.
 */
export function buildConnectorAssignmentRef(
  assignment: Pick<ECConnectorAssignment, 'id'>
): CreateExternalRefInput {
  return {
    external_type: 'encounter_connector_assignment',
    external_id: assignment.id,
    relation_kind: 'linked_context',
  };
}

// ─────────────────────────────────────────────
// BOOKING INPUT BUILDERS
// ─────────────────────────────────────────────

/**
 * Builds a CreateBookingInput for a participant meeting a connector.
 * Caller provides the resolved appointment_type_id and resource_id
 * (fetched from the scheduling DB via the connector's scheduling_resource_id).
 *
 * Future: auto-resolve appointment_type_id from step.appointment_type_slug.
 */
export function buildConnectorMeetingBooking(params: {
  participant: ECParticipant;
  connectorResourceId: string;
  appointmentTypeId: string;
  startsAt: string;
  workflowStep?: ECWorkflowStep;
  connectorAssignment?: ECConnectorAssignment;
  notes?: string;
}): CreateBookingInput {
  const {
    participant,
    connectorResourceId,
    appointmentTypeId,
    startsAt,
    workflowStep,
    connectorAssignment,
    notes,
  } = params;

  const externalRefs: CreateExternalRefInput[] = [
    buildParticipantRef(participant),
  ];
  if (workflowStep)         externalRefs.push(buildWorkflowStepRef(workflowStep));
  if (connectorAssignment)  externalRefs.push(buildConnectorAssignmentRef(connectorAssignment));

  return {
    appointment_type_id: appointmentTypeId,
    resource_id: connectorResourceId,
    starts_at: startsAt,
    attendees: [
      {
        display_name: participant.display_name,
        email: participant.email,
        phone: participant.phone,
        role: 'primary',
        metadata: { ec_participant_id: participant.id },
      },
    ],
    external_refs: externalRefs,
    notes,
    metadata: {
      ec_campus_id: participant.campus_id,
    },
  };
}

/**
 * Builds a CreateBookingInput for a class/group signup.
 * The class_slot resource represents the capacity-limited class.
 */
export function buildClassSignupBooking(params: {
  participant: ECParticipant;
  classResourceId: string;
  appointmentTypeId: string;
  startsAt: string;
  workflowStep?: ECWorkflowStep;
}): CreateBookingInput {
  const { participant, classResourceId, appointmentTypeId, startsAt, workflowStep } = params;

  const externalRefs: CreateExternalRefInput[] = [
    buildParticipantRef(participant),
  ];
  if (workflowStep) externalRefs.push(buildWorkflowStepRef(workflowStep));

  return {
    appointment_type_id: appointmentTypeId,
    resource_id: classResourceId,
    starts_at: startsAt,
    attendees: [
      {
        display_name: participant.display_name,
        email: participant.email,
        role: 'primary',
        metadata: { ec_participant_id: participant.id },
      },
    ],
    external_refs: externalRefs,
    metadata: { ec_campus_id: participant.campus_id },
  };
}

// ─────────────────────────────────────────────
// RESOURCE MAPPERS
// ─────────────────────────────────────────────

/**
 * Maps an EC Connector to a Scheduling Core CreateResourceInput.
 * Call this when provisioning a connector's scheduling resource.
 */
export function mapConnectorToResource(
  connector: ECConnector
): CreateResourceInput {
  return {
    name: connector.display_name,
    kind: 'person' as SchedulingResourceKind,
    email: connector.email,
    timezone: connector.timezone ?? 'America/Chicago',
    metadata: {
      ec_connector_id: connector.id,
      ec_campus_id: connector.campus_id,
    },
  };
}

// ─────────────────────────────────────────────
// OUTCOME → WORKFLOW PROGRESSION
// ─────────────────────────────────────────────

/**
 * After a booking is completed, the EC workflow engine should call this
 * to determine whether the associated workflow step can be advanced.
 *
 * Returns { canAdvance: true } when outcome was positive.
 * The workflow engine queries scheduling_external_refs to find
 * bookings attached to a workflow step, then calls this check.
 *
 * STUB: Real implementation queries the outcome from the scheduling DB.
 */
export function evaluateOutcomeForWorkflowProgression(outcomeKind: string): {
  canAdvance: boolean;
  reason?: string;
} {
  const blockingOutcomes = ['no_show', 'needs_reassignment', 'cancelled_by_participant'];
  if (blockingOutcomes.includes(outcomeKind)) {
    return {
      canAdvance: false,
      reason: `Outcome "${outcomeKind}" blocks workflow progression. Requires manual review.`,
    };
  }
  return { canAdvance: true };
}

// ─────────────────────────────────────────────
// INTEGRATION NOTES (inline documentation)
// ─────────────────────────────────────────────
//
// HOW ENCOUNTER CONNECT USES THIS ADAPTER:
//
// 1. CONNECTOR SETUP
//    When a connector is onboarded in EC, call mapConnectorToResource()
//    and save the resulting scheduling_resource_id on the EC connector record.
//
// 2. PARTICIPANT BOOKS A MEETING
//    EC workflow calls buildConnectorMeetingBooking() → createBooking() service.
//    The booking stores encounter_participant + encounter_workflow_step refs.
//
// 3. CAMPUS SCOPING
//    Campuses map to scheduling_locations.
//    Connector resources carry a location_id matching the campus location.
//    Query resources filtered by location_id to get campus-scoped availability.
//
// 4. WORKFLOW GATE CHECK
//    EC workflow step "requires_booking = true" queries:
//      scheduling_external_refs WHERE external_type = 'encounter_workflow_step'
//        AND external_id = <step_id>
//      JOIN scheduling_bookings WHERE status = 'completed'
//    If a completed booking exists → step is satisfied.
//
// 5. OUTCOME FEEDS BACK
//    When a connector completes a booking with an outcome, EC polls/listens
//    to scheduling_outcomes (or a webhook) and calls
//    evaluateOutcomeForWorkflowProgression() to decide next step.
//
// 6. CLASS SIGNUPS
//    Classes are scheduling_resources with kind='class_slot' and capacity > 1.
//    The appointment type's max_attendees mirrors the class cap.
//    Participants sign up via buildClassSignupBooking().
