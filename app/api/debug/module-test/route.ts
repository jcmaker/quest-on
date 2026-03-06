import { NextResponse } from "next/server";

/**
 * Tests each module import individually to find which one crashes.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const results: Record<string, string> = {};

  // Test 1: supabase-server
  try {
    const { getSupabaseServer } = await import("@/lib/supabase-server");
    const client = getSupabaseServer();
    results["lib/supabase-server"] = client ? "OK" : "returned null";
  } catch (e) {
    results["lib/supabase-server"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 2: supabase-client
  try {
    await import("@/lib/supabase-client");
    results["lib/supabase-client"] = "OK";
  } catch (e) {
    results["lib/supabase-client"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 3: logger
  try {
    await import("@/lib/logger");
    results["lib/logger"] = "OK";
  } catch (e) {
    results["lib/logger"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 4: api-response
  try {
    await import("@/lib/api-response");
    results["lib/api-response"] = "OK";
  } catch (e) {
    results["lib/api-response"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 5: rate-limit
  try {
    await import("@/lib/rate-limit");
    results["lib/rate-limit"] = "OK";
  } catch (e) {
    results["lib/rate-limit"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 6: validations
  try {
    await import("@/lib/validations");
    results["lib/validations"] = "OK";
  } catch (e) {
    results["lib/validations"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 7: get-current-user
  try {
    await import("@/lib/get-current-user");
    results["lib/get-current-user"] = "OK";
  } catch (e) {
    results["lib/get-current-user"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 8: exam-handlers
  try {
    await import("@/app/api/supa/handlers/exam-handlers");
    results["handlers/exam-handlers"] = "OK";
  } catch (e) {
    results["handlers/exam-handlers"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 9: session-handlers
  try {
    await import("@/app/api/supa/handlers/session-handlers");
    results["handlers/session-handlers"] = "OK";
  } catch (e) {
    results["handlers/session-handlers"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 10: submission-handlers
  try {
    await import("@/app/api/supa/handlers/submission-handlers");
    results["handlers/submission-handlers"] = "OK";
  } catch (e) {
    results["handlers/submission-handlers"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 11: drive-handlers
  try {
    await import("@/app/api/supa/handlers/drive-handlers");
    results["handlers/drive-handlers"] = "OK";
  } catch (e) {
    results["handlers/drive-handlers"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 12: chunking
  try {
    await import("@/lib/chunking");
    results["lib/chunking"] = "OK";
  } catch (e) {
    results["lib/chunking"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 13: embedding
  try {
    await import("@/lib/embedding");
    results["lib/embedding"] = "OK";
  } catch (e) {
    results["lib/embedding"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 14: audit
  try {
    await import("@/lib/audit");
    results["lib/audit"] = "OK";
  } catch (e) {
    results["lib/audit"] = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
  }

  const failures = Object.entries(results).filter(([, v]) => v !== "OK");

  return NextResponse.json({
    ok: failures.length === 0,
    failCount: failures.length,
    results,
  });
}
