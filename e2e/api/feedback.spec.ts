import { test, expect } from "../fixtures/auth.fixture";
import { seedExam, seedSession, cleanupTestData } from "../helpers/seed";
import { getTestSupabase } from "../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("POST /api/feedback — Student Answer Submission", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/feedback", {
      data: {
        examCode: "TEST",
        answers: [{ text: "answer" }],
      },
    });
    expect(res.status()).toBe(401);
  });

  test("missing examCode → 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/feedback", {
      data: {
        answers: [{ text: "answer" }],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("missing answers → 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/feedback", {
      data: {
        examCode: "TEST",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("exam not found → 404", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/feedback", {
      data: {
        examCode: "NONEXISTENT",
        answers: [{ text: "answer" }],
      },
    });
    expect(res.status()).toBe(404);
  });

  test("student submits answers → 200 + DB records", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    // Pre-create session in in_progress state
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.post("/api/feedback", {
      data: {
        examCode: exam.code,
        examId: exam.id,
        studentId: "test-student-id",
        answers: [
          { text: "다형성은 OOP의 핵심 원칙입니다." },
          { text: "스택은 LIFO, 큐는 FIFO 구조입니다." },
        ],
        sessionId: session.id,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.feedback).toBeTruthy();
    expect(body.examCode).toBe(exam.code);
    expect(body.status).toBe("submitted");

    // Verify submissions in DB
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id);
    expect(submissions!.length).toBeGreaterThanOrEqual(1);
  });

  test("closed exam → 400", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "closed" });

    const res = await studentRequest.post("/api/feedback", {
      data: {
        examCode: exam.code,
        answers: [{ text: "answer" }],
      },
    });

    expect(res.status()).toBe(400);
  });
});
