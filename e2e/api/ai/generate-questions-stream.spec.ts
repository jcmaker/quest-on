import { test, expect } from "../../fixtures/auth.fixture";
import { parseSSEEvents } from "../../helpers/sse";

test.describe("POST /api/ai/generate-questions-stream — SSE Streaming", () => {
  const validPayload = {
    examTitle: "OOP Concepts Exam",
    questionCount: 2,
    difficulty: "intermediate",
  };

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/ai/generate-questions-stream", {
      data: validPayload,
    });
    expect(res.status()).toBe(401);
  });

  test("student → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post(
      "/api/ai/generate-questions-stream",
      { data: validPayload }
    );
    expect(res.status()).toBe(403);
  });

  test("empty body → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/ai/generate-questions-stream",
      { data: {} }
    );
    expect(res.status()).toBe(400);
  });

  test("instructor streams → 200 SSE with events", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post(
      "/api/ai/generate-questions-stream",
      { data: validPayload }
    );

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/event-stream");

    const body = await res.text();
    const events = parseSSEEvents(body);

    // Should have at least progress + complete events
    const eventTypes = events.map((e) => e.event);
    expect(eventTypes).toContain("progress");
    expect(eventTypes).toContain("complete");
  });

  test("minimal fields (examTitle only) → 200", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post(
      "/api/ai/generate-questions-stream",
      { data: { examTitle: "Simple Exam" } }
    );

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/event-stream");
  });
});
