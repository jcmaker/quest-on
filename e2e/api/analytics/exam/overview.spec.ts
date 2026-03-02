import { test, expect } from "../../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedGrade,
  seedMessage,
  cleanupTestData,
} from "../../../helpers/seed";

test.describe("GET /api/analytics/exam/[examId]/overview", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("overview with sessions, grades, and messages", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "My answer to Q1" });
    await seedGrade(session.id, 0, 85, "Good work");
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Help me understand",
    });

    const res = await instructorRequest.get(
      `/api/analytics/exam/${exam.id}/overview`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Verify top-level shape
    expect(body).toHaveProperty("examId");
    expect(body).toHaveProperty("totalStudents");
    expect(body).toHaveProperty("submittedStudents");
    expect(body).toHaveProperty("averageScore");
    expect(body).toHaveProperty("students");
    expect(body).toHaveProperty("statistics");
    expect(body).toHaveProperty("stageAnalysis");
    expect(body).toHaveProperty("rubricAnalysis");
    expect(body).toHaveProperty("questionTypeAnalysis");
    expect(body.totalStudents).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.students)).toBe(true);
  });

  test("empty exam with no sessions", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await instructorRequest.get(
      `/api/analytics/exam/${exam.id}/overview`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalStudents).toBe(0);
    expect(body.students).toEqual([]);
  });

  test("student blocked", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await studentRequest.get(
      `/api/analytics/exam/${exam.id}/overview`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("INSTRUCTOR_ACCESS_REQUIRED");
  });

  test("non-owner instructor blocked", async ({ playwright }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "other-instructor-id",
    });

    const otherInstructorReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        Accept: "application/json",
      },
    });

    const res = await otherInstructorReq.get(
      `/api/analytics/exam/${exam.id}/overview`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCESS_DENIED");
    await otherInstructorReq.dispose();
  });

  test("anon blocked", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.get(
      `/api/analytics/exam/${exam.id}/overview`
    );

    expect(res.status()).toBe(401);
  });
});
