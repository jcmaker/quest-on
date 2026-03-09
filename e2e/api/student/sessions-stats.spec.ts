import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/student/sessions/stats", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("no sessions returns all zeros with null average", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.get("/api/student/sessions/stats");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalSessions).toBe(0);
    expect(body.completedSessions).toBe(0);
    expect(body.inProgressSessions).toBe(0);
    expect(body.overallAverageScore).toBeNull();
  });

  test("completed sessions with grades returns correct stats", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 0, 80);
    await seedGrade(session.id, 1, 90);

    const res = await studentRequest.get("/api/student/sessions/stats");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.totalSessions).toBe(1);
    expect(body.completedSessions).toBe(1);
    expect(body.inProgressSessions).toBe(0);
    expect(body.overallAverageScore).toBe(85); // (80 + 90) / 2
  });

  test("mix of completed and in-progress sessions", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    // Completed session
    await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    // In-progress session (no submitted_at)
    const exam2 = await seedExam({ status: "running", title: "Exam 2" });
    await seedSession(exam2.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.get("/api/student/sessions/stats");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.totalSessions).toBe(2);
    expect(body.completedSessions).toBe(1);
    expect(body.inProgressSessions).toBe(1);
  });

  test("instructor blocked", async ({ instructorRequest }) => {
    const res = await instructorRequest.get("/api/student/sessions/stats");

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("STUDENT_ACCESS_REQUIRED");
  });

  test("anon blocked", async ({ anonRequest }) => {
    const res = await anonRequest.get("/api/student/sessions/stats");

    expect(res.status()).toBe(401);
  });
});
