import { createBrowserClient } from '@supabase/ssr';

// APP-SPECIFIC: This file belongs to the host app, not the reusable core.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
