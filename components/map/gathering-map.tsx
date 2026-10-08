'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';

/**
 * The hub's map. Draws only what the server already decided is safe:
 *
 *   gathering pins  at the database-derived public coordinates
 *                   (events.public_lat/lng, migration 033), so a home is
 *                   never sharper than its campus pin
 *   campus pins     the church's own buildings
 *   church pins     other churches that listed themselves and were verified
 *
 * No person is ever a pin, and the browser's location is never asked for.
 * Tiles: OpenFreeMap (keyless, OpenStreetMap data).
 */

export interface MapPin {
  id: string;
  kind: 'gathering' | 'campus' | 'church';
  lat: number;
  lng: number;
  title: string;
  /** Second line in the popup: a time, a city, a count. */
  subtitle?: string | null;
  href: string;
  color?: string | null;
  /** The pin stands in for a held address (a home, or "address after RSVP"). */
  approximate?: boolean;
}

interface Props {
  pins: MapPin[];
  /** Where to look when there is nothing to fit. */
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  height?: number;
  label?: string;
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const PRIMARY = '#0f766e';

function toFeatures(pins: MapPin[], kinds: MapPin['kind'][]) {
  return {
    type: 'FeatureCollection' as const,
    features: pins
      .filter((p) => kinds.includes(p.kind))
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          kind: p.kind,
          title: p.title,
          subtitle: p.subtitle ?? '',
          href: p.href,
          color: p.color || PRIMARY,
          approximate: p.approximate ? 1 : 0,
        },
      })),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function GatheringMap({ pins, center, zoom = 11, height = 440, label = 'Map of gatherings' }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const el = container.current;
    if (!el) return;

    (async () => {
      const mod = await import('maplibre-gl');
      const maplibregl = (mod as unknown as { default?: typeof mod }).default ?? mod;
      if (disposed || !container.current) return;

      const first = pins[0];
      const map = new maplibregl.Map({
        container: el,
        style: STYLE_URL,
        center: center ? [center.lng, center.lat] : first ? [first.lng, first.lat] : [-98.5, 39.8],
        zoom: center || first ? zoom : 3,
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', (e) => {
        // A tile hiccup is not worth tearing the map down for; a failed style is.
        if (!map.isStyleLoaded() && (e as { error?: { status?: number } }).error) setFailed(true);
      });

      map.on('load', () => {
        if (disposed) return;

        map.addSource('places', { type: 'geojson', data: toFeatures(pins, ['campus', 'church']) });
        map.addSource('gatherings', {
          type: 'geojson',
          data: toFeatures(pins, ['gathering']),
          cluster: true,
          clusterRadius: 42,
          clusterMaxZoom: 15,
        });

        map.addLayer({
          id: 'places',
          type: 'circle',
          source: 'places',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'kind'], 'campus'], 9, 7],
            'circle-color': '#ffffff',
            'circle-stroke-width': 3,
            'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'campus'], PRIMARY, '#64748b'],
          },
        });
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'gatherings',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': PRIMARY,
            'circle-opacity': 0.85,
            'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 15, 26],
          },
        });
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'gatherings',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 },
          paint: { 'text-color': '#ffffff' },
        });
        map.addLayer({
          id: 'gathering',
          type: 'circle',
          source: 'gatherings',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 8,
            'circle-color': ['case', ['==', ['get', 'approximate'], 1], '#ffffff', ['get', 'color']],
            'circle-stroke-width': ['case', ['==', ['get', 'approximate'], 1], 3, 2],
            'circle-stroke-color': ['case', ['==', ['get', 'approximate'], 1], ['get', 'color'], '#ffffff'],
          },
        });

        const popup = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string | number>;
          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [number, number];
          const note = Number(p.approximate) === 1 ? '<div style="color:#64748b">Pinned at the church. Address after you RSVP.</div>' : '';
          new maplibregl.Popup({ offset: 12, maxWidth: '260px' })
            .setLngLat(coords)
            .setHTML(
              `<div style="font:13px/1.4 system-ui,sans-serif">` +
                `<div style="font-weight:600">${escapeHtml(String(p.title))}</div>` +
                (p.subtitle ? `<div>${escapeHtml(String(p.subtitle))}</div>` : '') +
                note +
                `<a href="${escapeHtml(String(p.href))}" style="color:${PRIMARY};font-weight:600">Open</a>` +
                `</div>`,
            )
            .addTo(map);
        };
        map.on('click', 'gathering', popup);
        map.on('click', 'places', popup);
        map.on('click', 'clusters', async (e) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
          if (!f) return;
          const source = map.getSource('gatherings') as GeoJSONSource;
          const next = await source.getClusterExpansionZoom(Number(f.properties?.cluster_id));
          map.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: next });
        });
        for (const layer of ['gathering', 'places', 'clusters']) {
          map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
        }

        if (pins.length > 1 && !center) {
          const bounds = new maplibregl.LngLatBounds();
          for (const p of pins) bounds.extend([p.lng, p.lat]);
          map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
        }
      });
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; new pins arrive through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource('gatherings') as GeoJSONSource | undefined)?.setData(toFeatures(pins, ['gathering']));
    (map.getSource('places') as GeoJSONSource | undefined)?.setData(toFeatures(pins, ['campus', 'church']));
  }, [pins]);

  if (failed) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-foreground-muted" style={{ height }}>
        The map couldn&apos;t load right now. The list view has everything.
      </div>
    );
  }

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className="overflow-hidden rounded-lg border border-border bg-surface-muted"
      style={{ height }}
    />
  );
}
