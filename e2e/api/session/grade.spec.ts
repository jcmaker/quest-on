import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  cleanupTestData,
  getGrades,
} from "../../helpers/seed";

test.describe("Grading — /api/session/[sessionId]/grade", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── GET — fetch session grading data ──

  test("instructor gets grading data → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Polymorphism is..." });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "Can you explain polymorphism?",
    });

    const res = await instructorRequest.get(
      `/api/session/${session.id}/grade`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session).toBeTruthy();
    expect(body.exam).toBeTruthy();
    expect(body.submissions).toBeTruthy();
  });

  test("student cannot access grading → 403", async ({ studentRequest }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await studentRequest.get(
      `/api/session/${session.id}/grade`
    );

    expect(res.status()).toBe(403);
  });

  // ── POST — save manual grade ──

  test("instructor saves manual grade → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await instructorRequest.post(
      `/api/session/${session.id}/grade`,
      {
        data: {
          questionIdx: 0,
          score: 85,
          comment: "Good answer with minor issues",
          stageGrading: {
            chat: { score: 80, reasoning: "Good discussion" },
            answer: { score: 90, reasoning: "Solid answer" },
          },
        },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.grade).toBeTruthy();
    expect(body.grade.score).toBe(85);
    expect(body.grade.q_idx).toBe(0);

    // Verify in DB
    const grades = await getGrades(session.id);
    expect(grades).toHaveLength(1);
    expect(grades[0].score).toBe(85);
  });

  test("instructor upserts grade (idempotent) → 200", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    // First grade
    await instructorRequest.post(`/api/session/${session.id}/grade`, {
      data: { questionIdx: 0, score: 70, comment: "First attempt" },
    });

    // Update same question
    const res = await instructorRequest.post(
      `/api/session/${session.id}/grade`,
      {
        data: { questionIdx: 0, score: 85, comment: "Revised grade" },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.grade.score).toBe(85);

    // Should still be 1 grade (upsert)
    const grades = await getGrades(session.id);
    expect(grades).toHaveLength(1);
    expect(grades[0].score).toBe(85);
  });

  test("non-owner instructor cannot grade → 403", async ({ playwright }) => {
    const exam = await seedExam({
      instructor_id: "other-instructor-id",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const instructorReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        Accept: "application/json",
      },
    });

    const res = await instructorReq.post(
      `/api/session/${session.id}/grade`,
      {
        data: { questionIdx: 0, score: 50, comment: "Not my exam" },
      }
    );

    expect(res.status()).toBe(403);
    await instructorReq.dispose();
  });

  // ── PUT — AI auto-grade ──

  test("instructor triggers AI auto-grade → 200, grades saved", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, {
      answer: "Polymorphism allows objects of different types to be treated uniformly.",
    });
    await seedSubmission(session.id, 1, {
      answer: "Stack is LIFO, Queue is FIFO.",
    });

    const res = await instructorRequest.put(
      `/api/session/${session.id}/grade`,
      { data: {} }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.gradesCount).toBeGreaterThanOrEqual(1);

    // Verify grades in DB
    const grades = await getGrades(session.id);
    expect(grades.length).toBeGreaterThanOrEqual(1);
    for (const g of grades) {
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.score).toBeLessThanOrEqual(100);
    }
  });

  test("student cannot trigger auto-grade → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await studentRequest.put(
      `/api/session/${session.id}/grade`,
      { data: {} }
    );

    expect(res.status()).toBe(403);
  });
});
