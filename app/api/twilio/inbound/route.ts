import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';
import { twilioSignatureValid } from '@/lib/notifications/twilio-signature';

/**
 * Twilio calls this when someone texts one of the church numbers. STOP
 * (and its synonyms) turns texts off for that number everywhere it is on
 * file; START turns them back on. Twilio itself sends the confirmation
 * reply and blocks sends after a STOP; this keeps our records true, so the
 * account page and every enqueue agree with what the person said.
 *
 * Requests are verified with Twilio's signature (HMAC-SHA1 of the URL and
 * the sorted form fields under the auth token). Configure the number or
 * Messaging Service's "A message comes in" webhook as
 *   POST <site>/api/twilio/inbound
 * or set TWILIO_WEBHOOK_URL to the exact URL Twilio is configured with.
 */

const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const START = new Set(['START', 'UNSTOP', 'YES']);

const twiml = () =>
  new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });

export async function POST(request: NextRequest) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });

  const raw = await request.text();
  const params = new URLSearchParams(raw);
  const url = process.env.TWILIO_WEBHOOK_URL?.trim() || `${siteUrl()}/api/twilio/inbound`;
  if (!twilioSignatureValid(url, params, request.headers.get('x-twilio-signature'), token)) {
    return NextResponse.json({ error: 'Bad signature.' }, { status: 403 });
  }

  const from = params.get('From') ?? '';
  const optOutType = (params.get('OptOutType') ?? '').toUpperCase();
  const word = (params.get('Body') ?? '').trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, '') ?? '';
  const stop = optOutType === 'STOP' || STOP.has(word);
  const start = optOutType === 'START' || START.has(word);
  if (!stop && !start) return twiml();

  const admin = await createServiceRoleClient();
  const { data: changed } = await admin.rpc('ec_sms_opt_change', {
    from_phone: from,
    opted_in: start && !stop,
    source: stop ? 'sms_stop' : 'sms_start',
  });
  await admin.from('audit_log').insert({
    church_id: null,
    actor_id: null,
    actor_label: 'Text message reply',
    action: stop ? 'sms.opted_out' : 'sms.opted_in',
    entity_type: 'phone',
    metadata: { phone_last4: from.replace(/\D/g, '').slice(-4), records_changed: changed ?? 0 },
  });
  return twiml();
}
