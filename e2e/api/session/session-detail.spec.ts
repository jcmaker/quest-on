import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/session/[sessionId] — Session Detail", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await anonRequest.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(401);
  });

  test("invalid UUID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.get("/api/session/not-a-uuid");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  test("non-existent session → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.get(
      "/api/session/00000000-0000-0000-0000-000000000001"
    );
    expect(res.status()).toBe(404);
  });

  test("other student cannot view → 403", async ({ playwright }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "another-student-id", {
      status: "in_progress",
    });

    // Request as test-student-id (not the session owner)
    const otherStudent = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        Accept: "application/json",
      },
    });

    const res = await otherStudent.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(403);
    await otherStudent.dispose();
  });

  test("other instructor cannot view → 403", async ({ playwright }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "other-instructor-id",
    });
    const session = await seedSession(exam.id, "some-student", {
      status: "in_progress",
    });

    // Request as test-instructor-id (not the exam owner)
    const otherInstructor = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        Accept: "application/json",
      },
    });

    const res = await otherInstructor.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(403);
    await otherInstructor.dispose();
  });

  test("student views own session → 200 with submissions and messages", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0, { answer: "Polymorphism answer" });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "What is polymorphism?",
    });

    const res = await studentRequest.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.session.id).toBe(session.id);
    expect(body.submissions).toHaveLength(1);
    expect(body.messages).toHaveLength(1);
  });

  test("instructor views own exam session → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "test-instructor-id",
    });
    const session = await seedSession(exam.id, "some-student", {
      status: "submitted",
    });

    const res = await instructorRequest.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.session.id).toBe(session.id);
    expect(body.session.exam).toBeDefined();
    expect(body.session.exam.instructor_id).toBe("test-instructor-id");
  });
});
