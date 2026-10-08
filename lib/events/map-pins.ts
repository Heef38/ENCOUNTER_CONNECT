import type { MapPin } from '@/components/map/gathering-map';
import type { ViewerEvent } from './types';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';

/**
 * Turns what a viewer may see into map pins. Pure: no database, no session.
 *
 * Gatherings use map_lat/map_lng only (the database-derived public
 * coordinates), never exact_lat/exact_lng, so a page's pin can never be
 * sharper than the page itself. A pin "stands in" (is drawn hollow) when the
 * gathering is a home or its address is held.
 */

export interface CampusPin {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  city?: string | null;
}

export interface ChurchPin {
  church_id: string;
  church_name: string;
  connect_name: string | null;
  slug: string | null;
  campus_id: string;
  campus_name: string;
  lat: number | string | null;
  lng: number | string | null;
  city: string | null;
  upcoming_public: number;
}

export function gatheringPins(events: ViewerEvent[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const e of events) {
    if (e.map_lat === null || e.map_lng === null) continue;
    if (e.status === 'cancelled' && new Date(e.ends_at).getTime() < Date.now()) continue;
    const when = `${formatDateInZone(e.starts_at, e.timezone, { weekday: 'short', month: 'short', day: 'numeric' })}, ${formatTimeInZone(e.starts_at, e.timezone)}`;
    pins.push({
      id: e.id,
      kind: 'gathering',
      lat: e.map_lat,
      lng: e.map_lng,
      title: e.status === 'cancelled' ? `Cancelled: ${e.title}` : e.title,
      subtitle: [when, e.location_label].filter(Boolean).join(' · '),
      href: `/hub/e/${e.id}`,
      color: e.event_type?.color ?? null,
      approximate: e.venue_kind === 'home' || e.address_hidden_pending_rsvp,
    });
  }
  return pins;
}

export function campusPins(campuses: CampusPin[], href: string): MapPin[] {
  return campuses
    .filter((c) => c.lat !== null && c.lng !== null)
    .map((c) => ({
      id: `campus-${c.id}`,
      kind: 'campus' as const,
      lat: Number(c.lat),
      lng: Number(c.lng),
      title: c.name,
      subtitle: c.city ?? null,
      href,
    }));
}

/** Other listed churches, as church pins only (never their gatherings). */
export function churchPins(rows: ChurchPin[], excludeChurchId: string | null): MapPin[] {
  return rows
    .filter((r) => r.church_id !== excludeChurchId && r.lat !== null && r.lng !== null && r.slug)
    .map((r) => ({
      id: `church-${r.campus_id}`,
      kind: 'church' as const,
      lat: Number(r.lat),
      lng: Number(r.lng),
      title: r.connect_name?.trim() || r.church_name,
      subtitle:
        [r.city, r.upcoming_public > 0 ? `${r.upcoming_public} open gathering${r.upcoming_public === 1 ? '' : 's'} this month` : null]
          .filter(Boolean)
          .join(' · ') || null,
      href: `/c/${r.slug}`,
    }));
}

/** A sensible center: the first campus with a pin, else the first pin. */
export function mapCenter(campuses: CampusPin[], pins: MapPin[]): { lat: number; lng: number } | null {
  const c = campuses.find((x) => x.lat !== null && x.lng !== null);
  if (c) return { lat: Number(c.lat), lng: Number(c.lng) };
  const p = pins[0];
  return p ? { lat: p.lat, lng: p.lng } : null;
}
