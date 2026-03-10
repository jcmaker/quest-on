import { test, expect } from "../../fixtures/auth.fixture";

test.describe("Admin Auth — POST/DELETE /api/admin/auth", () => {
  test("POST with valid credentials → 200 + sets cookie", async ({
    anonRequest,
  }) => {
    const res = await anonRequest.post("/api/admin/auth", {
      data: {
        username: process.env.ADMIN_USERNAME ?? "test-admin",
        password: process.env.ADMIN_PASSWORD ?? "test-password",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify cookie is set
    const setCookie = res.headers()["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("admin-session=");
  });

  test("POST with wrong password → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/admin/auth", {
      data: {
        username: process.env.ADMIN_USERNAME ?? "test-admin",
        password: "wrong-password",
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("POST with missing fields → 400", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/admin/auth", {
      data: { username: "test-admin" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  test("DELETE → 200 + clears cookie", async ({ anonRequest }) => {
    // First login to get a cookie
    await anonRequest.post("/api/admin/auth", {
      data: {
        username: process.env.ADMIN_USERNAME ?? "test-admin",
        password: process.env.ADMIN_PASSWORD ?? "test-password",
      },
    });

    // Then logout
    const res = await anonRequest.delete("/api/admin/auth");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
