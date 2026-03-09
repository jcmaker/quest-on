import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // 1. Database connectivity check
  const dbStart = Date.now();
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("exams").select("id").limit(1);
    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (err) {
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : "Unknown DB error",
    };
  }

  // 2. OpenAI API key presence check (no actual API call)
  checks.openai = {
    ok: !!process.env.OPENAI_API_KEY,
    ...(!process.env.OPENAI_API_KEY && { error: "OPENAI_API_KEY not set" }),
  };

  // 3. Required env vars check
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.env = {
    ok: missingVars.length === 0,
    ...(missingVars.length > 0 && { error: `Missing: ${missingVars.join(", ")}` }),
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
