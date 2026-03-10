import { test, expect } from "../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
} from "../helpers/seed";
import { getTestSupabase } from "../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("Chat — POST /api/chat", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student sends chat message → 200, gets AI response from mock", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/chat", {
      data: {
        message: "What is polymorphism?",
        sessionId: session.id,
        questionIdx: 0,
        examTitle: exam.title,
        examCode: exam.code,
        examId: exam.id,
        studentId: "test-student-id",
        currentQuestionText: "Explain polymorphism in OOP.",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.response).toBeTruthy();
    expect(typeof body.response).toBe("string");

    // Verify messages were saved in DB
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id)
      .eq("q_idx", 0)
      .order("created_at", { ascending: true });

    expect(messages).toBeTruthy();
    expect(messages!.length).toBeGreaterThanOrEqual(2); // user + ai
    expect(messages![0].role).toBe("user");
    expect(messages![0].content).toBe("What is polymorphism?");
  });

  test("missing required fields → 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/chat", {
      data: {},
    });

    // Validation should reject missing fields with 400
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});
