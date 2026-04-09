import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("GET /api/admin/logs", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("non-admin blocked", async ({ studentRequest }) => {
    const res = await studentRequest.get("/api/admin/logs");

    expect(res.status()).toBe(401);
  });

  test("admin gets empty logs", async ({ adminRequest }) => {
    const res = await adminRequest.get("/api/admin/logs");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.logs).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("admin gets logs with level filter", async ({ adminRequest }) => {
    // Seed some error logs directly
    await supabase.from("error_logs").insert([
      { level: "error", message: "Something broke", payload: {} },
      { level: "warn", message: "Something warned", payload: {} },
      { level: "info", message: "Something happened", payload: {} },
    ]);

    const res = await adminRequest.get("/api/admin/logs?level=error");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // All returned logs should be error level
    for (const log of body.logs) {
      expect(log.level).toBe("error");
    }
  });

  test("pagination params respected", async ({ adminRequest }) => {
    // Seed multiple logs
    const logs = Array.from({ length: 5 }, (_, i) => ({
      level: "info",
      message: `Log entry ${i}`,
      payload: {},
    }));
    await supabase.from("error_logs").insert(logs);

    const res = await adminRequest.get("/api/admin/logs?limit=2&offset=0");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    expect(body.logs.length).toBeLessThanOrEqual(2);
  });
});
