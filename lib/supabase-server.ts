import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a fresh Supabase server client using the service role key.
 * For use in API routes and server-side code only.
 *
 * P0-3: No singleton — serverless warm starts can retain stale module-level
 * state across invocations, preventing key rotation from taking effect.
 * Supabase JS v2 is fetch-based so client creation cost is negligible.
 */
export function getSupabaseServer(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}
