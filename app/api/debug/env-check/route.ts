import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint to check which environment variables are set.
 * Returns boolean status only — never exposes actual values.
 * DELETE THIS FILE after staging is confirmed working.
 */
export async function GET() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "OPENAI_API_KEY",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "ADMIN_JWT_SECRET",
  ];

  const optional = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "DATABASE_URL",
  ];

  const status: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const key of required) {
    const isSet = !!process.env[key];
    status[key] = isSet;
    if (!isSet) missing.push(key);
  }

  for (const key of optional) {
    status[key] = !!process.env[key];
  }

  return NextResponse.json({
    ok: missing.length === 0,
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
    missing,
    status,
  });
}
