import { test, expect } from "../../fixtures/auth.fixture";
import { seedExam, seedSession, cleanupTestData } from "../../helpers/seed";
import { parseSSEEvents } from "../../helpers/sse";
import { TEST_IDS, TIMEOUTS } from "../../constants";
import { getTestSupabase } from "../../helpers/supabase-test-client";

test.afterEach(async () => {
  await cleanupTestData();
});

test.describe("POST /api/chat/stream", () => {
  test("unauthenticated returns 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/chat/stream", {
      data: { message: "hello", sessionId: "test-session" },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("empty body returns 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/chat/stream", {
      data: {},
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("missing sessionId returns 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/chat/stream", {
      data: { message: "hello" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("non-existent session returns 400 INVALID_SESSION", async ({ studentRequest }) => {
    // Need a valid-looking but non-existent UUID for sessionId
    const res = await studentRequest.post("/api/chat/stream", {
      data: {
        message: "hello",
        sessionId: "00000000-0000-0000-0000-000000000099",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SESSION");
  });

  test("valid session returns SSE stream", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, TEST_IDS.STUDENT, {
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.post("/api/chat/stream", {
      data: {
        message: "What is polymorphism?",
        sessionId: session.id,
        questionIdx: 0,
        examId: exam.id,
        examTitle: exam.title,
        examCode: exam.code,
      },
      timeout: TIMEOUTS.API_RESPONSE,
    });

    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("text/event-stream");

    const body = await res.text();
    const events = parseSSEEvents(body);
    // Should have at least one data chunk + [DONE]
    expect(events.length).toBeGreaterThanOrEqual(2);

    // Last event should be [DONE]
    const lastEvent = events[events.length - 1];
    expect(lastEvent.data).toBe("[DONE]");
  });

  test("messages saved to DB after stream", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running", started_at: new Date().toISOString() });
    const session = await seedSession(exam.id, TEST_IDS.STUDENT, {
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.post("/api/chat/stream", {
      data: {
        message: "Explain stack vs queue",
        sessionId: session.id,
        questionIdx: 0,
        examId: exam.id,
        examTitle: exam.title,
        examCode: exam.code,
      },
      timeout: TIMEOUTS.API_RESPONSE,
    });

    expect(res.status()).toBe(200);
    // Consume the full response to ensure DB writes complete
    await res.text();

    // Check messages table
    const supabase = getTestSupabase();
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    // Should have at least user + ai messages
    expect(messages).toBeTruthy();
    expect(messages!.length).toBeGreaterThanOrEqual(2);

    const userMsg = messages!.find((m: { role: string }) => m.role === "user");
    const aiMsg = messages!.find((m: { role: string }) => m.role === "ai");
    expect(userMsg).toBeTruthy();
    expect(aiMsg).toBeTruthy();
    expect(userMsg!.content).toBe("Explain stack vs queue");
    expect(aiMsg!.content).toBeTruthy();
  });
});
