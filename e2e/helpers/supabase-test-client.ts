import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

// Load test env
dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

let _client: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured for the local test DB.
 * Uses service_role key for full access (no RLS).
 */
export function getTestSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !key) {
    throw new Error(
      "Missing test Supabase env vars. Run `supabase start` and check .env.test"
    );
  }

  _client = createClient(url, key);
  return _client;
}
