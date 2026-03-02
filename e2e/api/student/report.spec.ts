import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("Student Report — GET /api/student/session/[sessionId]/report", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student gets report for submitted session → 200 with full data", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: now,
      started_at: now,
    });
    await seedSubmission(session.id, 0, { answer: "Answer about polymorphism" });
    await seedSubmission(session.id, 1, { answer: "Answer about data structures" });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Can you explain polymorphism?",
    });
    await seedMessage(session.id, 0, {
      role: "assistant",
      content: "Polymorphism means many forms...",
    });
    await seedGrade(session.id, 0, 85, "Good explanation");
    await seedGrade(session.id, 1, 90, "Excellent answer");

    const res = await studentRequest.get(
      `/api/student/session/${session.id}/report`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Session data
    expect(body.session).toBeTruthy();
    expect(body.session.id).toBe(session.id);

    // Exam data
    expect(body.exam).toBeTruthy();
    expect(body.exam.id).toBe(exam.id);
    expect(body.exam.title).toBe(exam.title);
    expect(body.exam.questions).toBeTruthy();

    // Submissions organized by question index
    expect(body.submissions).toBeTruthy();
    expect(body.submissions[0]).toBeTruthy();
    expect(body.submissions[0].answer).toContain("polymorphism");
    expect(body.submissions[1]).toBeTruthy();

    // Messages organized by question index
    expect(body.messages).toBeTruthy();
    expect(body.messages[0]).toBeTruthy();
    expect(body.messages[0].length).toBeGreaterThanOrEqual(2);

    // Grades organized by question index
    expect(body.grades).toBeTruthy();
    expect(body.grades[0]).toBeTruthy();
    expect(body.grades[0].score).toBe(85);
    expect(body.grades[1].score).toBe(90);

    // Overall score
    expect(body.overallScore).toBeTruthy();
    expect(typeof body.overallScore).toBe("number");
  });

  test("student cannot access another student's report → 403", async ({
    playwright,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "submitted",
      submitted_at: now,
    });

    // Create a different student context
    const otherStudentRequest = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        Accept: "application/json",
      },
    });

    const res = await otherStudentRequest.get(
      `/api/student/session/${session.id}/report`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");

    await otherStudentRequest.dispose();
  });

  test("unsubmitted session returns error → 400", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.get(
      `/api/student/session/${session.id}/report`
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SESSION_NOT_SUBMITTED");
  });

  test("nonexistent session → 404", async ({ studentRequest }) => {
    const res = await studentRequest.get(
      "/api/student/session/00000000-0000-0000-0000-000000000001/report"
    );

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("SESSION_NOT_FOUND");
  });

  test("invalid session ID format → 400", async ({ studentRequest }) => {
    const res = await studentRequest.get(
      "/api/student/session/not-a-uuid/report"
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  test("instructor cannot access student report → 403", async ({
    instructorRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: now,
    });

    const res = await instructorRequest.get(
      `/api/student/session/${session.id}/report`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("STUDENT_ACCESS_REQUIRED");
  });

  test("anon cannot access report → 401", async ({ anonRequest }) => {
    const res = await anonRequest.get(
      "/api/student/session/00000000-0000-0000-0000-000000000001/report"
    );

    expect(res.status()).toBe(401);
  });
});
