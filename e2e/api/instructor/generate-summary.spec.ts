import { test, expect } from "../../fixtures/auth.fixture";

test.describe("POST /api/instructor/generate-summary — AI Summary", () => {
  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/instructor/generate-summary", {
      data: { sessionId: "fake-id" },
    });
    expect(res.status()).toBe(401);
  });

  test("student → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/instructor/generate-summary", {
      data: { sessionId: "fake-id" },
    });
    expect(res.status()).toBe(403);
  });

  test("instructor → 410 (deprecated route)", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/instructor/generate-summary",
      { data: {} }
    );
    expect(res.status()).toBe(410);
  });
});
