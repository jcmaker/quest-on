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

test.describe("GET/PATCH /api/admin/users/:userId", () => {
  const fakeUserId = "user_fake_test_00000000";

  test("GET — anon returns 401", async ({ anonRequest }) => {
    const res = await anonRequest.get(`/api/admin/users/${fakeUserId}`);
    expect(res.status()).toBe(401);
  });

  test("GET — student returns 401", async ({ studentRequest }) => {
    const res = await studentRequest.get(`/api/admin/users/${fakeUserId}`);
    expect(res.status()).toBe(401);
  });

  test("GET — admin passes auth guard", async ({ adminRequest }) => {
    const res = await adminRequest.get(`/api/admin/users/${fakeUserId}`);
    // Clerk may return 404/500 for fake user, but auth guard passes
    expect(res.status()).not.toBe(401);
  });

  test("PATCH — anon returns 401", async ({ anonRequest }) => {
    const res = await anonRequest.patch(`/api/admin/users/${fakeUserId}`, {
      data: { role: "student" },
    });
    expect(res.status()).toBe(401);
  });

  test("PATCH — invalid role returns 400", async ({ adminRequest }) => {
    const res = await adminRequest.patch(`/api/admin/users/${fakeUserId}`, {
      data: { role: "superadmin" },
    });
    // Should reject invalid role (admin passes auth but validation fails)
    expect(res.status()).toBe(400);
  });
});
