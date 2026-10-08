import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatheringPins, churchPins } from '../../lib/events/map-pins.ts';
import type { ViewerEvent } from '../../lib/events/types.ts';

function event(over: Partial<ViewerEvent>): ViewerEvent {
  return {
    id: 'e1', church_id: 'c1', title: 'Home group', description: null,
    starts_at: '2026-10-14T00:00:00.000Z', ends_at: '2099-10-14T02:00:00.000Z', timezone: 'America/Chicago',
    all_day: false, series_id: null, status: 'published', visibility: 'private', venue_kind: 'home', is_pinned: false,
    event_type: null, campus: null, host_name: 'Hope T.', location_label: 'Midland', address: null,
    address_hidden_pending_rsvp: true, map_lat: 31.9686, map_lng: -102.0779, exact_lat: 31.997, exact_lng: -102.077,
    capacity: null, rsvp_required: false, rsvp_deadline: null, going_count: 0, my_rsvp: null, my_guest_count: 0,
    cancellation_reason: null, is_host: false, can_edit: false, can_report: false, can_rsvp: true, can_check_in: false,
    can_pin: false, can_message_host: true,
    ...over,
  };
}

test('a pin always uses the public coordinates, never the exact venue', () => {
  const [pin] = gatheringPins([event({})]);
  assert.equal(pin.lat, 31.9686);
  assert.equal(pin.lng, -102.0779);
  assert.equal(pin.approximate, true, 'a home is drawn as a stand-in pin');
  assert.match(pin.subtitle ?? '', /7:00 PM/, 'times are in the church’s zone');
});

test('gatherings without public coordinates are left off the map', () => {
  assert.equal(gatheringPins([event({ map_lat: null, map_lng: null })]).length, 0);
});

test('church pins never include the viewer’s own church or unslugged churches', () => {
  const rows = [
    { church_id: 'c1', church_name: 'Grace', connect_name: null, slug: 'grace', campus_id: 'k1', campus_name: 'Main', lat: 1, lng: 2, city: 'Loop', upcoming_public: 0 },
    { church_id: 'c2', church_name: 'Other', connect_name: 'Other Connect', slug: 'other', campus_id: 'k2', campus_name: 'Main', lat: '3', lng: '4', city: 'Seminole', upcoming_public: 2 },
    { church_id: 'c3', church_name: 'NoSlug', connect_name: null, slug: null, campus_id: 'k3', campus_name: 'Main', lat: 5, lng: 6, city: null, upcoming_public: 0 },
  ];
  const pins = churchPins(rows, 'c1');
  assert.deepEqual(pins.map((p) => p.title), ['Other Connect']);
  assert.equal(pins[0].href, '/c/other');
  assert.match(pins[0].subtitle ?? '', /2 open gatherings/);
});
