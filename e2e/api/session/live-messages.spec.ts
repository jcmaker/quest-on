import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedMessage,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/session/[sessionId]/live-messages", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Success cases ──

  test("instructor sees messages for specific session → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
      instructor_id: "test-instructor-id",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "What is polymorphism?",
    });
    await seedMessage(session.id, 0, {
      role: "ai",
      content: "Polymorphism is a key concept in OOP.",
    });

    const res = await instructorRequest.get(
      `/api/session/${session.id}/live-messages`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toBeDefined();
    expect(body.messages.length).toBeGreaterThanOrEqual(2);
    expect(body.timestamp).toBeDefined();

    // Verify message structure
    const msg = body.messages[0];
    expect(msg.session_id).toBe(session.id);
    expect(msg.student).toBeDefined();
    expect(msg.student.id).toBe("test-student-id");
  });

  test("instructor sees empty messages for session with no messages → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
      instructor_id: "test-instructor-id",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await instructorRequest.get(
      `/api/session/${session.id}/live-messages`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([]);
  });

  // ── Auth / access control ──

  test("student gets 403", async ({ studentRequest }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.get(
      `/api/session/${session.id}/live-messages`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  test("non-owner instructor gets 403", async ({ playwright }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
      instructor_id: "other-instructor-id",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const nonOwnerInstructor = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const res = await nonOwnerInstructor.get(
      `/api/session/${session.id}/live-messages`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
    await nonOwnerInstructor.dispose();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await anonRequest.get(
      `/api/session/${session.id}/live-messages`
    );

    expect(res.status()).toBe(401);
  });

  // ── Validation ──

  test("invalid UUID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.get(
      "/api/session/not-a-uuid/live-messages"
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  test("non-existent session → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.get(
      "/api/session/00000000-0000-0000-0000-000000000001/live-messages"
    );

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });
});
