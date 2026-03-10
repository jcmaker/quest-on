import { test, expect } from "../../fixtures/auth.fixture";

test.describe("GET /api/universities/search", () => {
  test("search with query returns results", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/universities/search?q=서울");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.universities)).toBe(true);
    expect(body.universities.length).toBeGreaterThan(0);
  });

  test("search with empty query returns results", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/universities/search?q=");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.universities)).toBe(true);
    expect(body.universities.length).toBeGreaterThan(0);
  });

  test("search with limit respects limit", async ({ anonRequest }) => {
    const res = await anonRequest.get(
      "/api/universities/search?q=대학&limit=3"
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.universities.length).toBeLessThanOrEqual(3);
  });
});
