// Server-side helpers for Supabase Storage (migration 025 buckets).
//
// Path convention in BOTH buckets: `<church_id>/<...>` — the first folder is
// the tenant boundary that the storage RLS policies enforce.
//
// `connect_docs.file_url` can hold either an external `https://` link or a
// bare storage path in the private `connect-docs` bucket. Use
// `resolveDocFileUrl` at render time — it passes external links through and
// signs storage paths.

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CHURCH_ASSETS_BUCKET = 'church-assets';
export const CONNECT_DOCS_BUCKET = 'connect-docs';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface UploadResult {
  ok: boolean;
  /** Public URL (church-assets) or storage path (connect-docs). */
  value?: string;
  error?: string;
}

function safeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'file';
}

/**
 * Upload to the PUBLIC church-assets bucket. Returns the permanent public URL
 * (suitable for storing in logo_url / hero_image_url style columns).
 */
export async function uploadChurchAsset(
  admin: SupabaseClient,
  churchId: string,
  folder: 'logo' | 'campus' | 'lesson-media',
  file: File,
): Promise<UploadResult> {
  const path = `${churchId}/${folder}/${randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await admin.storage
    .from(CHURCH_ASSETS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };

  const { data } = admin.storage.from(CHURCH_ASSETS_BUCKET).getPublicUrl(path);
  return { ok: true, value: data.publicUrl };
}

/**
 * Upload to the PRIVATE connect-docs bucket. Returns the storage PATH —
 * store it in connect_docs.file_url and sign it at render time.
 */
export async function uploadConnectDocFile(
  admin: SupabaseClient,
  churchId: string,
  file: File,
): Promise<UploadResult> {
  const path = `${churchId}/${randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await admin.storage
    .from(CONNECT_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: path };
}

/**
 * Turn a connect_docs.file_url value into something a browser can open:
 * external links pass through, storage paths become 1-hour signed URLs.
 * Returns null when signing fails (e.g. the object was deleted).
 */
export async function resolveDocFileUrl(
  admin: SupabaseClient,
  fileUrl: string | null,
): Promise<string | null> {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

  const { data, error } = await admin.storage
    .from(CONNECT_DOCS_BUCKET)
    .createSignedUrl(fileUrl, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Delete a stored connect-doc file. No-op for external URLs. Best-effort. */
export async function deleteConnectDocFile(
  admin: SupabaseClient,
  fileUrl: string | null,
): Promise<void> {
  if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return;
  await admin.storage.from(CONNECT_DOCS_BUCKET).remove([fileUrl]);
}
