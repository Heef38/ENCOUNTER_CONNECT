import 'server-only';

import { PLATFORM_CONTACT_EMAIL, PLATFORM_NAME } from '@/lib/brand';

/**
 * Turns a public address into a pin, using OpenStreetMap's Nominatim.
 *
 * Only ever called for places that are public by nature: a campus, or a
 * gathering at a public place (a park, a coffee shop). Home addresses are
 * never sent to a geocoder (rethink §7.3); a home gathering's pin is its
 * campus pin, set by the database.
 *
 * One request per save, with an identifying User-Agent, inside Nominatim's
 * usage policy for light, interactive use. A failure returns null and the
 * gathering simply has no exact pin; nothing blocks on it.
 */

export interface GeocodeInput {
  line1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult | null> {
  if (process.env.GEOCODER_DISABLED === '1') return null;

  const street = input.line1?.trim();
  const city = input.city?.trim();
  if (!street && !city && !input.postalCode?.trim()) return null;

  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '0' });
  if (street) params.set('street', street);
  if (city) params.set('city', city);
  if (input.region?.trim()) params.set('state', input.region.trim());
  if (input.postalCode?.trim()) params.set('postalcode', input.postalCode.trim());
  params.set('countrycodes', (input.country?.trim() || 'US').toLowerCase());

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: {
        'User-Agent': `${PLATFORM_NAME}/1.0 (${PLATFORM_CONTACT_EMAIL})`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = rows[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch {
    return null;
  }
}
