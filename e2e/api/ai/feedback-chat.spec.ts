import { test, expect } from "../../fixtures/auth.fixture";
import { seedExam, seedSession, cleanupTestData } from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("POST /api/feedback-chat — Conversational Feedback", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/feedback-chat", {
      data: { message: "hello", examCode: "TEST" },
    });
    expect(res.status()).toBe(401);
  });

  test("missing required fields → 400", async ({ studentRequest }) => {
    // Missing message
    const res1 = await studentRequest.post("/api/feedback-chat", {
      data: { examCode: "TEST" },
    });
    expect(res1.status()).toBe(400);

    // Missing examCode
    const res2 = await studentRequest.post("/api/feedback-chat", {
      data: { message: "hello" },
    });
    expect(res2.status()).toBe(400);
  });

  test("exam not found → 404", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/feedback-chat", {
      data: { message: "hello", examCode: "NONEXISTENT" },
    });
    expect(res.status()).toBe(404);
  });

  test("student sends message → 200 with AI response + DB rows", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    // Pre-create session so we can check message insertion
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/feedback-chat", {
      data: {
        message: "What is polymorphism?",
        examCode: exam.code,
        questionId: "0",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();
    expect(body.examCode).toBe(exam.code);

    // Verify messages saved in DB (user + ai = 2 rows)
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id);
    expect(messages!.length).toBe(2);
    expect(messages!.some((m: { role: string }) => m.role === "user")).toBe(true);
    expect(messages!.some((m: { role: string }) => m.role === "ai")).toBe(true);
  });

  test("creates session if none exists → 200", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });
    // No session pre-created

    const res = await studentRequest.post("/api/feedback-chat", {
      data: {
        message: "What is polymorphism?",
        examCode: exam.code,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.response).toBeTruthy();

    // Session should have been auto-created
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", "test-student-id");
    expect(sessions!.length).toBe(1);
  });
});
