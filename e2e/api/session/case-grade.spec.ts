import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("Case grading chat API", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("GET returns empty messages for new question", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      questions: [
        {
          id: "q0",
          idx: 0,
          type: "essay",
          text: "Explain polymorphism.",
          prompt: "Explain polymorphism.",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Student answer" });

    const res = await instructorRequest.get(
      `/api/session/${session.id}/case-grade/chat?qIdx=0`,
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.messages).toEqual([]);
  });

  test("POST chat saves user and assistant messages", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      questions: [
        {
          id: "q0",
          idx: 0,
          type: "essay",
          text: "Explain polymorphism.",
          prompt: "Explain polymorphism.",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Student answer" });

    const res = await instructorRequest.post(
      `/api/session/${session.id}/case-grade/chat`,
      {
        data: { qIdx: 0, message: "이 답안을 평가해 주세요." },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.assistantMessage?.role).toBe("assistant");
    expect(body.assistantMessage?.content).toBeTruthy();

    const history = await instructorRequest.get(
      `/api/session/${session.id}/case-grade/chat?qIdx=0`,
    );
    const historyBody = await history.json();
    expect(historyBody.messages?.length).toBeGreaterThanOrEqual(2);
  });

  test("POST commit upserts manual grade", async ({ instructorRequest }) => {
    const exam = await seedExam({
      questions: [
        {
          id: "q0",
          idx: 0,
          type: "essay",
          text: "Explain polymorphism.",
          prompt: "Explain polymorphism.",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Student answer" });

    const res = await instructorRequest.post(
      `/api/session/${session.id}/case-grade/commit`,
      {
        data: { qIdx: 0, score: 88, comment: "Well reasoned answer." },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const gradeRes = await instructorRequest.get(
      `/api/session/${session.id}/grade`,
    );
    expect(gradeRes.status()).toBe(200);
    const gradeBody = await gradeRes.json();
    const g = gradeBody.grades?.["0"] ?? gradeBody.grades?.[0];
    expect(g?.score).toBe(88);
    expect(g?.comment).toBe("Well reasoned answer.");
    expect(g?.grade_type).toBe("manual");
  });

  test("student cannot access case-grade chat", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({
      questions: [
        {
          id: "q0",
          idx: 0,
          type: "essay",
          text: "Q",
          prompt: "Q",
        },
      ],
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await studentRequest.get(
      `/api/session/${session.id}/case-grade/chat?qIdx=0`,
    );

    expect(res.status()).toBe(403);
  });
});
