import { test, expect } from "../fixtures/auth.fixture";

test.describe("GET /api/health", () => {
  test("unauthenticated returns 200 with minimal response", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/health");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTruthy();
    expect(body).not.toHaveProperty("checks");
  });

  test("student returns 200 with minimal response (non-admin)", async ({ studentRequest }) => {
    const res = await studentRequest.get("/api/health");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTruthy();
    expect(body).not.toHaveProperty("checks");
  });

  test("admin returns full diagnostics", async ({ adminRequest }) => {
    const res = await adminRequest.get("/api/health");

    // Admin gets full response — 200 if all checks pass, 503 if degraded
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(["healthy", "degraded"]).toContain(body.status);
    expect(body.timestamp).toBeTruthy();
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("openai");
    expect(body.checks).toHaveProperty("env");
  });

  test("admin checks have correct structure", async ({ adminRequest }) => {
    const res = await adminRequest.get("/api/health");
    const body = await res.json();

    // Skip if not admin response (shouldn't happen with adminRequest)
    if (!body.checks) return;

    expect(typeof body.checks.database.ok).toBe("boolean");
    expect(typeof body.checks.database.latencyMs).toBe("number");
    expect(typeof body.checks.openai.ok).toBe("boolean");
    expect(typeof body.checks.env.ok).toBe("boolean");
  });
});
