/**
 * Color palette + helpers shared by the dashboard calendar and the
 * Appointment Types settings page. Until per-type colors are configured,
 * `colorForEvent` falls back to a deterministic hash so events still
 * differentiate visually.
 */

export interface NamedColor {
  name: string;
  hex: string;
}

export const PALETTE: NamedColor[] = [
  { name: 'Teal',    hex: '#14b8a6' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Violet',  hex: '#a855f7' },
  { name: 'Blue',    hex: '#3b82f6' },
  { name: 'Red',     hex: '#ef4444' },
  { name: 'Green',   hex: '#22c55e' },
  { name: 'Pink',    hex: '#ec4899' },
  { name: 'Orange',  hex: '#f97316' },
  { name: 'Cyan',    hex: '#06b6d4' },
  { name: 'Lime',    hex: '#84cc16' },
  { name: 'Indigo',  hex: '#6366f1' },
  { name: 'Slate',   hex: '#64748b' },
];

const PALETTE_HEX = PALETTE.map((c) => c.hex);

export function isValidHex(value: string | null | undefined): boolean {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Deterministic fallback color from a string seed. */
export function hashColor(seed: string | null | undefined): string {
  if (!seed) return PALETTE_HEX[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE_HEX[h % PALETTE_HEX.length];
}

export interface ColorableEvent {
  title: string;
  displayColor?: string | null;
  typeColor?: string | null;
}

export function colorForEvent(event: ColorableEvent): string {
  if (isValidHex(event.displayColor)) return event.displayColor!;
  if (isValidHex(event.typeColor))    return event.typeColor!;
  return hashColor(event.title);
}
