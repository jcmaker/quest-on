import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("Concurrency — simultaneous draft saves", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("two concurrent draft saves for different questions succeed without conflict", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    // Fire two saves concurrently for different questions
    const [res1, res2] = await Promise.all([
      studentRequest.post("/api/supa", {
        data: {
          action: "save_draft",
          data: {
            sessionId: session.id,
            questionId: 0,
            answer: "Concurrent answer for Q1",
          },
        },
      }),
      studentRequest.post("/api/supa", {
        data: {
          action: "save_draft",
          data: {
            sessionId: session.id,
            questionId: 1,
            answer: "Concurrent answer for Q2",
          },
        },
      }),
    ]);

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    // Verify both drafts were saved correctly
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .order("q_idx", { ascending: true });

    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(2);
    expect(submissions![0].answer).toBe("Concurrent answer for Q1");
    expect(submissions![1].answer).toBe("Concurrent answer for Q2");
  });

  test("two concurrent saves for the SAME question don't lose data", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    // Fire two saves concurrently for the same question
    const [res1, res2] = await Promise.all([
      studentRequest.post("/api/supa", {
        data: {
          action: "save_draft",
          data: {
            sessionId: session.id,
            questionId: 0,
            answer: "Version A",
          },
        },
      }),
      studentRequest.post("/api/supa", {
        data: {
          action: "save_draft",
          data: {
            sessionId: session.id,
            questionId: 0,
            answer: "Version B",
          },
        },
      }),
    ]);

    // Both should succeed (no 500 errors)
    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    // Verify exactly 1 row exists (UPSERT behavior)
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", session.id)
      .eq("q_idx", 0);

    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(1);
    // The answer should be one of the two versions (last write wins)
    expect(["Version A", "Version B"]).toContain(submissions![0].answer);
  });

  test("concurrent session creation for same exam/student returns same session", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    // Fire two create_or_get_session calls concurrently
    const [res1, res2] = await Promise.all([
      studentRequest.post("/api/supa", {
        data: {
          action: "create_or_get_session",
          data: { examId: exam.id, studentId: "test-student-id" },
        },
      }),
      studentRequest.post("/api/supa", {
        data: {
          action: "create_or_get_session",
          data: { examId: exam.id, studentId: "test-student-id" },
        },
      }),
    ]);

    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both should return the same session (race-safe UPSERT)
    expect(body1.session.id).toBe(body2.session.id);

    // Verify only 1 session exists in DB
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", "test-student-id");

    expect(sessions).toBeTruthy();
    expect(sessions!.length).toBe(1);
  });
});
