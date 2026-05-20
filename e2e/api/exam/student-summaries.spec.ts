import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/exam/[examId]/student-summaries", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor gets student summaries for submitted session", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 1,
          idx: 0,
        },
        {
          id: "q1",
          type: "essay",
          text: "Essay",
          idx: 1,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 0, 100, "Correct", "auto");
    await seedGrade(session.id, 1, 80, "Essay graded", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("submitted");
    expect(body.students[0].mcq).toEqual({ correct: 1, total: 1 });
    expect(body.students[0].caseProgress).toEqual({ graded: 1, total: 1 });
    expect(body.students[0].overallStatus).toBe("manually_graded");
  });

  test("includes in-progress session with submissions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      questions: [
        {
          id: "q0",
          type: "multiple-choice",
          text: "MCQ",
          options: ["A", "B", "C", "D"],
          correctOptionIndex: 0,
          idx: 0,
        },
      ],
    });
    const session = await seedSession(exam.id, "student-2", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0, { answer: "0" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("in-progress");
  });

  test("includes waiting-room session", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-waiting", {
      status: "waiting",
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].sessionId).toBe(session.id);
    expect(body.students[0].status).toBe("in-progress");
  });

  test("returns empty students when no sessions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([]);
  });

  test("student cannot access student summaries", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await studentRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(403);
  });

  test("anon cannot access student summaries", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(401);
  });

  test("non-owner instructor cannot access student summaries", async ({
    playwright,
  }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "other-instructor-id",
    });

    const otherInstructorReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const res = await otherInstructorReq.get(
      `/api/exam/${exam.id}/student-summaries`
    );

    expect(res.status()).toBe(403);
    await otherInstructorReq.dispose();
  });
});
