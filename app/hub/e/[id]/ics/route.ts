import { getEvent } from '@/lib/events/queries';
import { getChurchContext } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import { siteUrl } from '@/lib/site';

/**
 * "Add to my calendar": one gathering as an iCalendar file, built from the
 * same ViewerEvent the page renders, so the address in the file is exactly
 * what this viewer is allowed to see.
 */

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 lines are folded at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event || event.status === 'draft' || event.status === 'hidden') {
    return new Response('Not found', { status: 404 });
  }
  const church = await getChurchContext(event.church_id);
  const url = `${siteUrl()}/hub/e/${event.id}`;
  const where = event.address ?? event.location_label ?? '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//ChurchConnect//${escape(connectName(church))}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@churchconnect`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.starts_at)}`,
    `DTEND:${icsDate(event.ends_at)}`,
    `SUMMARY:${escape(event.status === 'cancelled' ? `Cancelled: ${event.title}` : event.title)}`,
    `DESCRIPTION:${escape(`${event.description ? `${event.description}\n\n` : ''}${url}`)}`,
    ...(where ? [`LOCATION:${escape(where)}`] : []),
    `URL:${url}`,
    `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(fold);

  return new Response(`${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'gathering'}.ics"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
