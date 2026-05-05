import 'server-only';

export interface SendSmsArgs {
  to: string;
  body: string;
  /** Override the default TWILIO_FROM_NUMBER for this send. */
  from?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  providerId?: string;
}

/**
 * Sends an SMS via Twilio's REST API. Uses HTTP basic auth with the
 * account SID + auth token (no SDK).
 */
export async function sendSms(args: SendSmsArgs): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const defaultFrom = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token) {
    return { ok: false, error: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not set.' };
  }
  const from = args.from ?? defaultFrom;
  if (!from) {
    return { ok: false, error: 'TWILIO_FROM_NUMBER is not set.' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const params = new URLSearchParams();
  params.set('From', from);
  params.set('To', args.to);
  params.set('Body', args.body);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error reaching Twilio.',
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore
  }

  if (!response.ok) {
    const obj = payload as { message?: string; code?: number } | null;
    const msg = obj?.message ?? `Twilio HTTP ${response.status}`;
    return { ok: false, error: msg };
  }

  const ok = payload as { sid?: string } | null;
  return { ok: true, providerId: ok?.sid };
}
