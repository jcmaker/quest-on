import { auth } from "@clerk/nextjs/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client that forwards the Clerk JWT as the Authorization
 * header. PostgREST decodes the JWT and populates request.jwt.claims,
 * making auth.clerk_user_id() return the current user's Clerk ID.
 *
 * RLS policies are enforced — this client can only read/write rows the
 * authenticated user owns.
 *
 * Use this client for: student routes reading own data, instructor routes
 * reading own exams/nodes.
 *
 * Use getSupabaseServer() (service role) for: admin operations, cross-user
 * data access, AI/grading pipelines, instructor viewing student data.
 *
 * PREREQUISITES:
 *   1. Supabase configured to accept Clerk JWTs (Dashboard → Auth → JWT Secret)
 *   2. Clerk JWT template named "supabase" created in Clerk Dashboard
 *      (Dashboard → JWT Templates → New template, name: "supabase")
 *   3. database/clerk_jwt_hook.sql applied to the database
 *   4. database/enable_rls_clerk.sql applied to the database
 */
export async function getSupabaseRLS(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  }

  const { getToken } = await auth();
  const token = await getToken({ template: "supabase" });

  if (!token) {
    throw new Error(
      "No Clerk auth token — user must be authenticated to use the RLS client"
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
