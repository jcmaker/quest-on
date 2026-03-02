import { test, expect } from "../../fixtures/auth.fixture";

test.describe("GET /api/admin/users", () => {
  test("non-admin (student) blocked", async ({ studentRequest }) => {
    const res = await studentRequest.get("/api/admin/users");

    expect(res.status()).toBe(401);
  });

  test("anon blocked", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/admin/users");

    expect(res.status()).toBe(401);
  });

  test("admin request passes auth guard", async ({ adminRequest }) => {
    const res = await adminRequest.get("/api/admin/users");

    // Admin auth passes — the Clerk API may fail with a dummy key in test,
    // but the auth guard itself should not return 401
    expect(res.status()).not.toBe(401);
  });
});
