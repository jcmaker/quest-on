import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("POST /api/instructor/generate-summary — AI Summary", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/instructor/generate-summary", {
      data: { sessionId: "fake-id" },
    });
    expect(res.status()).toBe(401);
  });

  test("student → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/instructor/generate-summary", {
      data: { sessionId: "fake-id" },
    });
    expect(res.status()).toBe(403);
  });

  test("missing sessionId → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/instructor/generate-summary",
      { data: {} }
    );
    expect(res.status()).toBe(400);
  });

  test("non-existent session → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/instructor/generate-summary",
      { data: { sessionId: "00000000-0000-0000-0000-000000000001" } }
    );
    expect(res.status()).toBe(404);
  });

  test("non-owner instructor → 403", async ({ instructorRequest }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "other-instructor-id",
    });
    const session = await seedSession(exam.id, "some-student", {
      status: "submitted",
    });
    await seedSubmission(session.id, 0, { answer: "Test answer" });

    const res = await instructorRequest.post(
      "/api/instructor/generate-summary",
      { data: { sessionId: session.id } }
    );
    expect(res.status()).toBe(403);
  });

  test("instructor generates summary → 200 with structured result", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      instructor_id: "test-instructor-id",
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSubmission(session.id, 0, {
      answer: "다형성은 OOP의 핵심 원칙으로, 같은 인터페이스를 통해 다양한 구현을 사용할 수 있게 합니다.",
    });

    const res = await instructorRequest.post(
      "/api/instructor/generate-summary",
      { data: { sessionId: session.id } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    const summary = body.summary;
    expect(summary.sentiment).toBeTruthy();
    expect(summary.strengths).toBeInstanceOf(Array);
    expect(summary.weaknesses).toBeInstanceOf(Array);
  });
});
