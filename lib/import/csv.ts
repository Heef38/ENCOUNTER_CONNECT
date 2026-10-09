/**
 * CSV reading for the people import. Pure functions, used in the browser
 * for the preview and again on the server, which trusts nothing the
 * browser sends. Handles quoted fields, doubled quotes, commas and line
 * breaks inside quotes, CRLF, a UTF-8 BOM, and semicolon-separated files.
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export type ImportField = 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'external_id' | 'joined_on' | 'groups';

export const IMPORT_FIELDS: Array<{ key: ImportField; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'full_name', label: 'Full name (if there is no first/last)' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Mobile phone' },
  { key: 'external_id', label: 'Their id in your old system' },
  { key: 'joined_on', label: 'Date they first came' },
  { key: 'groups', label: 'Groups (separated by commas or semicolons)' },
];

export type Mapping = Partial<Record<ImportField, number>>;

const CANDIDATES: Record<ImportField, RegExp[]> = {
  first_name: [/^first[\s_]*name$/, /^first$/, /^given[\s_]*name$/, /^nickname$/],
  last_name: [/^last[\s_]*name$/, /^last$/, /^surname$/, /^family[\s_]*name$/],
  full_name: [/^name$/, /^full[\s_]*name$/],
  email: [/^e-?mail$/, /^e-?mail[\s_]*address$/, /^primary[\s_]*e-?mail$/, /^home[\s_]*e-?mail$/, /e-?mail/],
  phone: [/^mobile[\s_]*phone([\s_]*number)?$/, /^mobile$/, /^cell([\s_]*phone)?$/, /^phone[\s_]*number$/, /^phone$/, /^home[\s_]*phone([\s_]*number)?$/, /phone/],
  external_id: [/^person[\s_]*id$/, /^id$/, /^member[\s_]*id$/, /^people[\s_]*id$/],
  joined_on: [/^created[\s_]*at$/, /^first[\s_]*attended$/, /^first[\s_]*visit$/, /^join(ed)?[\s_]*(date|on)$/, /^date[\s_]*added$/, /^membership[\s_]*start/],
  groups: [/^groups?$/, /^group[\s_]*names?$/, /^teams?$/],
};

/** Best guess at which column holds what, from the header row. */
export function guessMapping(headers: string[]): Mapping {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const field of Object.keys(CANDIDATES) as ImportField[]) {
    for (const re of CANDIDATES[field]) {
      const idx = norm.findIndex((h, i) => !used.has(i) && re.test(h));
      if (idx >= 0) {
        mapping[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  if (mapping.first_name !== undefined && mapping.last_name !== undefined) delete mapping.full_name;
  return mapping;
}

/** US numbers to +1XXXXXXXXXX; anything already international kept; else null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v.startsWith('+')) {
    const digits = v.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return EMAIL.test(v) && v.length <= 254 ? v : null;
}

/** A date the CSV gives (2024-03-05, 3/5/2024, or an ISO timestamp), as an ISO instant, never in the future. */
export function normalizeDate(raw: string | null | undefined, now = new Date()): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let d: Date | null = null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    d = new Date(Date.UTC(year, Number(us[1]) - 1, Number(us[2]), 12));
  } else if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  }
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return null;
  return d.getTime() > now.getTime() ? now.toISOString() : d.toISOString();
}

export function splitGroups(raw: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (raw ?? '')
        .split(/[;,|]/)
        .map((g) => g.trim().replace(/\s+/g, ' '))
        .filter((g) => g.length > 0 && g.length <= 80),
    ),
  );
}

export interface ImportRow {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  joined_on: string | null;
  groups: string[];
}

/** One CSV line to a person, or the reason it can't be one. */
export function toImportRow(cells: string[], mapping: Mapping): ImportRow | { error: string } {
  const get = (f: ImportField) => (mapping[f] === undefined ? '' : (cells[mapping[f] as number] ?? '').trim());
  let first = get('first_name');
  let last = get('last_name');
  if ((!first || !last) && get('full_name')) {
    const parts = get('full_name').split(/\s+/);
    first = first || parts[0] || '';
    last = last || parts.slice(1).join(' ');
  }
  first = first.slice(0, 100);
  last = last.slice(0, 100);
  if (!first) return { error: 'No first name' };
  const rawEmail = get('email');
  const email = normalizeEmail(rawEmail);
  return {
    first_name: first,
    last_name: last || '-',
    email,
    phone: normalizePhone(get('phone')),
    external_id: get('external_id').slice(0, 100) || null,
    joined_on: normalizeDate(get('joined_on')),
    groups: splitGroups(get('groups')),
  };
}
