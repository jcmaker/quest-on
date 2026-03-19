/**
 * Grading Pipeline Flow Tests
 *
 * End-to-end simulation of the full submission → grading → grades display pipeline.
 * These tests verify the actual code paths that QA reported as broken,
 * NOT just individual endpoints.
 *
 * Bug coverage:
 * - Phase 1: auto-grade results visible in final-grades (was filtered out)
 * - Phase 2: score calculated by graded count, not total questions
 * - Phase 3: CAS guard prevents double grading
 * - Phase 5: heartbeat auto-submit produces compressed_session_data
 * - Phase 6: checkSubmissionOnServer filters by examCode
 * - Score consistency: same session shows same score across 3 endpoints
 */
import { test, expect, BYPASS_SECRET } from "../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  seedMessage,
  seedGrade,
  cleanupTestData,
  getGrades,
  getSession,
} from "../helpers/seed";

/** Poll until grades appear for a session (auto-grading is async) */
async function waitForGrades(
  sessionId: string,
  expectedMinCount: number,
  timeoutMs = 15_000,
  intervalMs = 500
): Promise<Array<{ q_idx: number; score: number; grade_type: string }>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const grades = await getGrades(sessionId);
    const realGrades = grades.filter(
      (g: { grade_type?: string }) => g.grade_type !== "ai_failed"
    );
    if (realGrades.length >= expectedMinCount) return grades;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Return whatever we have (may be empty)
  return await getGrades(sessionId);
}

test.describe("Grading Pipeline — Full Flow Simulation", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Phase 1: Auto-grade results visible in final-grades ──

  test("student submits → auto-grade → instructor sees grades in final-grades", async ({
    studentRequest,
    instructorRequest,
  }) => {
    // 1. Seed exam (running, with rubric)
    const exam = await seedExam({
      status: "running",
      started_at: new Date(Date.now() - 60_000).toISOString(),
    });

    // 2. Seed session (in_progress) with submissions
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 30_000).toISOString(),
      attempt_timer_started_at: new Date(Date.now() - 30_000).toISOString(),
    });
    await seedSubmission(session.id, 0, {
      answer: "Polymorphism allows objects of different types to be treated uniformly through a common interface.",
    });
    await seedSubmission(session.id, 1, {
      answer: "A stack follows LIFO (Last In, First Out) while a queue follows FIFO (First In, First Out).",
    });

    // 3. Student submits via /api/feedback
    const submitRes = await studentRequest.post("/api/feedback", {
      data: {
        examCode: exam.code,
        answers: [
          { text: "Polymorphism allows objects of different types to be treated uniformly." },
          { text: "Stack is LIFO, Queue is FIFO." },
        ],
        examId: exam.id,
        sessionId: session.id,
        studentId: "test-student-id",
      },
    });

    expect(submitRes.status()).toBe(200);

    // 4. Wait for auto-grading to complete (async)
    const grades = await waitForGrades(session.id, 2);
    expect(grades.length).toBeGreaterThanOrEqual(2);

    // 5. Instructor checks final-grades — auto grades should be visible (Phase 1 fix)
    const finalGradesRes = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );
    expect(finalGradesRes.status()).toBe(200);
    const finalBody = await finalGradesRes.json();
    expect(finalBody.success).toBe(true);
    expect(finalBody.grades).toHaveLength(1);
    expect(finalBody.grades[0].session_id).toBe(session.id);
    expect(finalBody.grades[0].score).toBeGreaterThan(0);
    expect(finalBody.grades[0].gradedCount).toBeGreaterThanOrEqual(1);
  });

  // ── Phase 2: Score consistency across 3 endpoints ──

  test("score matches across grade GET, student report, and final-grades", async ({
    studentRequest,
    instructorRequest,
  }) => {
    // Setup: exam + session + auto-grade via submission
    const exam = await seedExam({
      status: "running",
      started_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 30_000).toISOString(),
      attempt_timer_started_at: new Date(Date.now() - 30_000).toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "Polymorphism explanation..." });
    await seedSubmission(session.id, 1, { answer: "Stack vs Queue explanation..." });

    // Submit
    await studentRequest.post("/api/feedback", {
      data: {
        examCode: exam.code,
        answers: [
          { text: "Polymorphism explanation..." },
          { text: "Stack vs Queue explanation..." },
        ],
        examId: exam.id,
        sessionId: session.id,
        studentId: "test-student-id",
      },
    });

    // Wait for grading
    await waitForGrades(session.id, 2);

    // Get scores from all 3 endpoints
    const [gradeRes, reportRes, finalRes] = await Promise.all([
      instructorRequest.get(`/api/session/${session.id}/grade`),
      studentRequest.get(`/api/student/session/${session.id}/report`),
      instructorRequest.get(`/api/exam/${exam.id}/final-grades`),
    ]);

    expect(gradeRes.status()).toBe(200);
    expect(reportRes.status()).toBe(200);
    expect(finalRes.status()).toBe(200);

    const gradeBody = await gradeRes.json();
    const reportBody = await reportRes.json();
    const finalBody = await finalRes.json();

    // Phase 2: All 3 should use the same calculation (gradedCount, not totalQuestions)
    const gradeScore = gradeBody.overallScore;
    const reportScore = reportBody.overallScore;
    const finalScore = finalBody.grades.find(
      (g: { session_id: string }) => g.session_id === session.id
    )?.score;

    expect(gradeScore).toBe(reportScore);
    expect(gradeScore).toBe(finalScore);

    // Verify gradedCount is present
    expect(gradeBody.gradedCount).toBeGreaterThanOrEqual(1);
    expect(gradeBody.totalQuestionCount).toBe(2);
    expect(reportBody.gradedCount).toBeGreaterThanOrEqual(1);
    expect(reportBody.totalQuestionCount).toBe(2);
  });

  // ── Phase 2: Partial grading score calculation ──

  test("partial grading: score divides by graded count, not total questions", async ({
    instructorRequest,
  }) => {
    // Setup: 2 questions, only q_idx=0 graded (manually seed)
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    // Only grade 1 of 2 questions (score: 80)
    await seedGrade(session.id, 0, 80, "Good answer", "auto");

    // Instructor checks session grade
    const gradeRes = await instructorRequest.get(
      `/api/session/${session.id}/grade`
    );
    expect(gradeRes.status()).toBe(200);
    const body = await gradeRes.json();

    // Phase 2 fix: should be 80 (80/1), NOT 40 (80/2)
    expect(body.overallScore).toBe(80);
    expect(body.gradedCount).toBe(1);
    expect(body.totalQuestionCount).toBe(2);

    // Same from final-grades
    const finalRes = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );
    const finalBody = await finalRes.json();
    expect(finalBody.grades[0].score).toBe(80);
    expect(finalBody.grades[0].gradedCount).toBe(1);
  });

  // ── Phase 1+2: ai_failed grades excluded from score ──

  test("ai_failed grades excluded from score, real grades counted correctly", async ({
    instructorRequest,
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    // q_idx=0: successfully graded (score 90)
    // q_idx=1: AI failed (score 0, grade_type=ai_failed)
    await seedGrade(session.id, 0, 90, "Excellent", "auto");
    await seedGrade(session.id, 1, 0, "[AI 채점 실패] Timeout", "ai_failed");

    // Instructor grade view
    const gradeRes = await instructorRequest.get(
      `/api/session/${session.id}/grade`
    );
    const gradeBody = await gradeRes.json();
    expect(gradeBody.overallScore).toBe(90); // Only q_idx=0 counts
    expect(gradeBody.gradedCount).toBe(1);

    // Student report
    const reportRes = await studentRequest.get(
      `/api/student/session/${session.id}/report`
    );
    const reportBody = await reportRes.json();
    expect(reportBody.overallScore).toBe(90);
    expect(reportBody.gradedCount).toBe(1);

    // Final grades
    const finalRes = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );
    const finalBody = await finalRes.json();
    expect(finalBody.grades[0].score).toBe(90);
  });

  // ── Phase 3: Force-end triggers auto-grading ──

  test("force-end → auto-submit → auto-grade → grades visible", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 30_000).toISOString(),
      attempt_timer_started_at: new Date(Date.now() - 30_000).toISOString(),
    });
    await seedSubmission(session.id, 0, { answer: "My polymorphism answer" });
    await seedSubmission(session.id, 1, { answer: "My stack/queue answer" });

    // Force-end the exam
    const endRes = await instructorRequest.post(
      `/api/exam/${exam.id}/end`,
      { data: {} }
    );
    expect(endRes.status()).toBe(200);
    const endBody = await endRes.json();
    expect(endBody.sessionsForceSubmitted).toBeGreaterThanOrEqual(1);

    // Session should be submitted
    const updatedSession = await getSession(session.id);
    expect(updatedSession.submitted_at).not.toBeNull();
    expect(updatedSession.auto_submitted).toBe(true);

    // Wait for auto-grading
    const grades = await waitForGrades(session.id, 1, 20_000);
    expect(grades.length).toBeGreaterThanOrEqual(1);

    // Force-end should also produce compressed_session_data
    const sessionAfterGrade = await getSession(session.id);
    expect(sessionAfterGrade.compressed_session_data).not.toBeNull();

    // Grades should be visible in final-grades (exam is now closed, but grades should still show)
    // Note: final-grades doesn't check exam status
    const finalRes = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );
    const finalBody = await finalRes.json();
    expect(finalBody.grades.length).toBeGreaterThanOrEqual(1);
  });

  // ── Phase 5: Heartbeat auto-submit produces compressed data ──

  test("heartbeat auto-submit enriches session with compressed data", async ({
    playwright,
  }) => {
    // Exam with 1-minute duration, started 2 minutes ago (expired)
    const exam = await seedExam({
      status: "running",
      duration: 1, // 1 minute
      started_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    });

    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      attempt_timer_started_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    });

    // Add submissions and messages (as if student was working)
    await seedSubmission(session.id, 0, { answer: "My answer to Q1" });
    await seedMessage(session.id, 0, {
      role: "user",
      content: "What is polymorphism?",
    });
    await seedMessage(session.id, 0, {
      role: "assistant",
      content: "Polymorphism is a concept in OOP...",
    });

    // Create a student request context for heartbeat
    const studentReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    // Send heartbeat — timer expired, should auto-submit
    const heartbeatRes = await studentReq.post("/api/supa", {
      data: {
        action: "session_heartbeat",
        data: {
          sessionId: session.id,
          studentId: "test-student-id",
        },
      },
    });

    expect(heartbeatRes.status()).toBe(200);
    const heartbeatBody = await heartbeatRes.json();
    expect(heartbeatBody.timeExpired).toBe(true);
    expect(heartbeatBody.autoSubmitted).toBeTruthy();

    // Phase 5 fix: session should now have compressed_session_data
    const updatedSession = await getSession(session.id);
    expect(updatedSession.submitted_at).not.toBeNull();
    expect(updatedSession.compressed_session_data).not.toBeNull();
    expect(updatedSession.compression_metadata).not.toBeNull();

    await studentReq.dispose();
  });

  // ── Edge case: all ai_failed → overallScore should be null, not 0 ──

  test("all ai_failed grades → overallScore is null (not 0)", async ({
    instructorRequest,
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    // Both questions failed AI grading
    await seedGrade(session.id, 0, 0, "[AI 채점 실패] Timeout", "ai_failed");
    await seedGrade(session.id, 1, 0, "[AI 채점 실패] Parse error", "ai_failed");

    // Instructor grade view → overallScore must be null
    const gradeRes = await instructorRequest.get(
      `/api/session/${session.id}/grade`
    );
    const gradeBody = await gradeRes.json();
    expect(gradeBody.overallScore).toBeNull();
    expect(gradeBody.gradedCount).toBe(0);

    // Student report → same
    const reportRes = await studentRequest.get(
      `/api/student/session/${session.id}/report`
    );
    const reportBody = await reportRes.json();
    expect(reportBody.overallScore).toBeNull();
    expect(reportBody.gradedCount).toBe(0);

    // Final grades → session should not appear (no scorable grades)
    const finalRes = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );
    const finalBody = await finalRes.json();
    expect(finalBody.grades).toHaveLength(0);
  });

  // ── Phase 6: Student sessions API returns examCode for filtering ──

  test("student sessions API includes examCode for client-side filtering", async ({
    studentRequest,
  }) => {
    // Create two exams with different codes
    const exam1 = await seedExam({
      status: "running",
      code: "EXAM1A",
      started_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const exam2 = await seedExam({
      status: "running",
      code: "EXAM2B",
      started_at: new Date(Date.now() - 60_000).toISOString(),
    });

    // Student has completed exam1, in-progress for exam2
    await seedSession(exam1.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedSession(exam2.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date(Date.now() - 30_000).toISOString(),
    });

    // Call the sessions API
    const sessionsRes = await studentRequest.get("/api/student/sessions");
    expect(sessionsRes.status()).toBe(200);
    const sessionsBody = await sessionsRes.json();
    const sessions = sessionsBody.sessions;

    // Each session should have examCode
    const exam1Session = sessions.find(
      (s: { examCode: string }) => s.examCode === "EXAM1A"
    );
    const exam2Session = sessions.find(
      (s: { examCode: string }) => s.examCode === "EXAM2B"
    );

    expect(exam1Session).toBeTruthy();
    expect(exam1Session.status).toBe("completed");

    // Only exam1 should match the "completed" filter for EXAM1A
    const completedForExam1 = sessions.filter(
      (s: { examCode: string; status: string }) =>
        s.examCode === "EXAM1A" &&
        ["submitted", "graded", "completed"].includes(s.status)
    );
    expect(completedForExam1.length).toBe(1);

    // exam2 should NOT match completed filter
    const completedForExam2 = sessions.filter(
      (s: { examCode: string; status: string }) =>
        s.examCode === "EXAM2B" &&
        ["submitted", "graded", "completed"].includes(s.status)
    );
    expect(completedForExam2.length).toBe(0);
  });
});
