import 'server-only';

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  /**
   * Override the global RESEND_FROM_EMAIL for this send. Format:
   *   "Display Name <user@domain.com>" or just "user@domain.com".
   */
  from?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  providerId?: string;
}

/**
 * Sends an email via Resend's REST API. Returns ok=false with a clear
 * error message on any failure (HTTP, auth, provider response). Caller
 * is expected to log failures into the outbox row's `error` column.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not set.' };
  }
  const from = args.from ?? defaultFrom;
  if (!from) {
    return { ok: false, error: 'RESEND_FROM_EMAIL is not set.' };
  }

  // Convert plain-text newlines to <br> for the HTML version so most
  // clients render it nicely. Keep the original as the text part.
  const html = escapeHtml(args.text).replace(/\n/g, '<br>');

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error reaching Resend.',
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Resend should always return JSON, but stay defensive.
  }

  if (!response.ok) {
    const obj = payload as { message?: string; error?: string } | null;
    const msg =
      obj?.message ?? obj?.error ?? `Resend HTTP ${response.status}`;
    return { ok: false, error: msg };
  }

  const ok = payload as { id?: string } | null;
  return { ok: true, providerId: ok?.id };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
