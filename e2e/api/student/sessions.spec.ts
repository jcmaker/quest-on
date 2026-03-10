import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("Student Sessions — GET /api/student/sessions", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student gets session list → 200, returns paginated sessions", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "My answer" });

    const res = await studentRequest.get("/api/student/sessions");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sessions).toBeTruthy();
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination).toBeTruthy();
    expect(body.pagination.page).toBe(1);

    // Verify session data structure
    const s = body.sessions.find(
      (ss: Record<string, unknown>) => ss.id === session.id
    );
    expect(s).toBeTruthy();
    expect(s.examId).toBe(exam.id);
    expect(s.examTitle).toBe(exam.title);
    expect(s.status).toBe("completed");
  });

  test("student gets graded session with score data", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Answer 1" });
    await seedSubmission(session.id, 1, { answer: "Answer 2" });
    await seedGrade(session.id, 0, 85, "Good work");
    await seedGrade(session.id, 1, 90, "Excellent");

    const res = await studentRequest.get("/api/student/sessions");

    expect(res.status()).toBe(200);
    const body = await res.json();
    const s = body.sessions.find(
      (ss: Record<string, unknown>) => ss.id === session.id
    );
    expect(s).toBeTruthy();
    expect(s.isGraded).toBe(true);
    expect(s.averageScore).toBeTruthy();
    expect(typeof s.averageScore).toBe("number");
  });

  test("empty sessions returns empty array", async ({ studentRequest }) => {
    const res = await studentRequest.get("/api/student/sessions");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  test("submitted session shows as completed, in_progress session shows as in-progress", async ({
    studentRequest,
  }) => {
    // With UNIQUE(exam_id, student_id), each student has one session per exam
    // Verify submitted session shows as "completed" and in_progress as "in-progress"
    const exam1 = await seedExam({ status: "running" });
    const exam2 = await seedExam({ status: "running" });

    // Submitted session for exam1
    const submitted = await seedSession(exam1.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    });

    // In-progress session for exam2
    const inProgress = await seedSession(exam2.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.get("/api/student/sessions");

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sessions.length).toBeGreaterThanOrEqual(2);

    const submittedSession = body.sessions.find(
      (s: Record<string, unknown>) => s.id === submitted.id
    );
    const inProgressSession = body.sessions.find(
      (s: Record<string, unknown>) => s.id === inProgress.id
    );
    expect(submittedSession.status).toBe("completed");
    expect(inProgressSession.status).toBe("in-progress");
  });

  test("pagination works with page param", async ({ studentRequest }) => {
    // Create 3 exams with submitted sessions
    for (let i = 0; i < 3; i++) {
      const exam = await seedExam({ status: "running" });
      await seedSession(exam.id, "test-student-id", {
        status: "submitted",
        submitted_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      });
    }

    const res = await studentRequest.get(
      "/api/student/sessions?page=1&limit=2"
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sessions.length).toBe(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.total).toBe(3);
  });

  test("instructor cannot access student sessions → 403", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.get("/api/student/sessions");

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("STUDENT_ACCESS_REQUIRED");
  });

  test("anon cannot access student sessions → 401", async ({
    anonRequest,
  }) => {
    const res = await anonRequest.get("/api/student/sessions");

    expect(res.status()).toBe(401);
  });
});
