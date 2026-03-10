import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

test.describe("AI — Error Handling via Mock Server", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  const validPayload = {
    examTitle: "Error Handling Test Exam",
    difficulty: "intermediate",
    questionCount: 2,
    topics: "testing",
  };

  // ── rate_limit ──

  test("AI rate limit → graceful error response", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      headers: { "x-mock-error": "rate_limit" },
      data: validPayload,
    });

    // API should return an error status (429 from mock or wrapped by handler)
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(600);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── server_error ──

  test("AI server error → graceful 500 response", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      headers: { "x-mock-error": "server_error" },
      data: validPayload,
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── malformed ──

  test("AI malformed response → graceful error, not crash", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/ai/generate-questions", {
      headers: { "x-mock-error": "malformed" },
      data: validPayload,
    });

    // Server should handle malformed JSON from AI gracefully
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── timeout (skip for CI speed; mock waits 30s) ──

  test("AI timeout → request does not hang forever", async ({
    instructorRequest,
  }) => {
    test.setTimeout(70_000); // Extended timeout for this test

    const res = await instructorRequest.post("/api/ai/generate-questions", {
      headers: { "x-mock-error": "timeout" },
      data: validPayload,
      timeout: 65_000,
    });

    // Should eventually get an error response (timeout or 504)
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
