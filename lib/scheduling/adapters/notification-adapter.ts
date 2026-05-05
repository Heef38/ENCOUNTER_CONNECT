// ============================================================
// SCHEDULING CORE — Notification Adapter
// REUSABLE CORE — interface is app-agnostic.
//
// Plug in any provider by implementing NotificationAdapter.
// The ConsoleNotificationAdapter is used for local development.
// ============================================================

// ─────────────────────────────────────────────
// INTERFACE
// ─────────────────────────────────────────────

export interface NotificationPayload {
  to: string;
  subject?: string;  // email only
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  provider_ref?: string; // external message ID
  error?: string;
}

export interface NotificationAdapter {
  sendEmail(payload: NotificationPayload): Promise<NotificationResult>;
  sendSms(payload: NotificationPayload): Promise<NotificationResult>;
}

// ─────────────────────────────────────────────
// CONSOLE ADAPTER (development / placeholder)
// ─────────────────────────────────────────────

export class ConsoleNotificationAdapter implements NotificationAdapter {
  async sendEmail(payload: NotificationPayload): Promise<NotificationResult> {
    console.log('[SCHEDULING EMAIL]', {
      to:      payload.to,
      subject: payload.subject,
      body:    payload.body.slice(0, 120) + (payload.body.length > 120 ? '…' : ''),
    });
    return { success: true, provider_ref: `console-email-${Date.now()}` };
  }

  async sendSms(payload: NotificationPayload): Promise<NotificationResult> {
    console.log('[SCHEDULING SMS]', {
      to:   payload.to,
      body: payload.body.slice(0, 80) + (payload.body.length > 80 ? '…' : ''),
    });
    return { success: true, provider_ref: `console-sms-${Date.now()}` };
  }
}

// ─────────────────────────────────────────────
// SINGLETON — swap this for production adapters
// ─────────────────────────────────────────────

let _adapter: NotificationAdapter = new ConsoleNotificationAdapter();

export function setNotificationAdapter(adapter: NotificationAdapter) {
  _adapter = adapter;
}

export function getNotificationAdapter(): NotificationAdapter {
  return _adapter;
}
