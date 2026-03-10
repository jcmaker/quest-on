import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedMessage,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/exam/[examId]/live-messages", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Success cases ──

  test("instructor gets live messages for own exam → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Student question about polymorphism",
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/live-messages`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toBeDefined();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("Student question");
    expect(body.messages[0].student).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  test("instructor sees no messages for exam with no active sessions → 200 empty", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    // Create a submitted session (not active — submitted_at is set)
    await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/live-messages`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([]);
  });

  test("instructor sees multiple messages across sessions → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session1 = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    const session2 = await seedSession(exam.id, "another-student", {
      status: "in_progress",
    });
    await seedMessage(session1.id, 0, {
      role: "user",
      content: "Question from student 1",
    });
    await seedMessage(session2.id, 0, {
      role: "user",
      content: "Question from student 2",
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/live-messages`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.messages.length).toBeGreaterThanOrEqual(2);
  });

  // ── Auth / access control ──

  test("student gets 403", async ({ studentRequest }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.get(
      `/api/exam/${exam.id}/live-messages`
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
      `/api/exam/${exam.id}/live-messages`
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

    const res = await anonRequest.get(
      `/api/exam/${exam.id}/live-messages`
    );

    expect(res.status()).toBe(401);
  });

  // ── Validation ──

  test("invalid UUID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.get(
      "/api/exam/not-a-uuid/live-messages"
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  test("non-existent exam → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.get(
      "/api/exam/00000000-0000-0000-0000-000000000001/live-messages"
    );

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NOT_FOUND");
  });
});
