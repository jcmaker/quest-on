import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
  getExam,
  getSession,
  getSessionsByExam,
} from "../../helpers/seed";

test.describe("Exam Lifecycle — start / end / sessions", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── POST /api/exam/[examId]/start ──

  test("instructor starts exam → 200, status=running, waiting sessions become in_progress", async ({
    instructorRequest,
  }) => {
    // Seed exam in draft status + 2 waiting sessions
    const exam = await seedExam({ status: "draft" });
    await seedSession(exam.id, "student-1", { status: "waiting" });
    await seedSession(exam.id, "student-2", { status: "waiting" });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/start`,
      { data: {} }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("running");
    expect(body.sessionsUpdated).toBe(2);

    // Verify DB state
    const updatedExam = await getExam(exam.id);
    expect(updatedExam.status).toBe("running");
    expect(updatedExam.started_at).toBeTruthy();

    // Verify sessions transitioned
    const sessions = await getSessionsByExam(exam.id);
    for (const s of sessions) {
      expect(s.status).toBe("in_progress");
      expect(s.started_at).toBeTruthy();
      expect(s.attempt_timer_started_at).toBeTruthy();
    }
  });

  test("student cannot start exam → 403", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await studentRequest.post(
      `/api/exam/${exam.id}/start`,
      { data: {} }
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  test("unauthenticated user cannot start exam → 401", async ({
    anonRequest,
  }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await anonRequest.post(
      `/api/exam/${exam.id}/start`,
      { data: {} }
    );

    expect(res.status()).toBe(401);
  });

  test("cannot start already running exam → 400", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/start`,
      { data: {} }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  test("non-owner instructor cannot start exam → 403", async ({
    playwright,
  }) => {
    // Create exam owned by a different instructor
    const exam = await seedExam({
      status: "draft",
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

    const res = await otherInstructorReq.post(
      `/api/exam/${exam.id}/start`,
      { data: {} }
    );

    expect(res.status()).toBe(403);
    await otherInstructorReq.dispose();
  });

  test("invalid exam ID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/exam/not-a-uuid/start",
      { data: {} }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  // ── POST /api/exam/[examId]/end ──

  test("instructor ends running exam → 200, status=closed, active sessions force-submitted", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    await seedSession(exam.id, "student-1", { status: "in_progress" });
    await seedSession(exam.id, "student-2", { status: "in_progress" });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/end`,
      { data: {} }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("closed");
    expect(body.sessionsForceSubmitted).toBe(2);

    // Verify DB
    const updatedExam = await getExam(exam.id);
    expect(updatedExam.status).toBe("closed");

    const sessions = await getSessionsByExam(exam.id);
    for (const s of sessions) {
      expect(s.status).toBe("submitted");
      expect(s.submitted_at).toBeTruthy();
    }
  });

  test("cannot end draft exam → 400", async ({ instructorRequest }) => {
    const exam = await seedExam({ status: "draft" });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/end`,
      { data: {} }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  // ── GET /api/exam/[examId]/sessions ──

  test("instructor gets session list → 200 with session data", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    await seedSession(exam.id, "student-1", { status: "waiting" });
    await seedSession(exam.id, "student-2", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/sessions`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sessions).toHaveLength(2);
  });

  test("student cannot list sessions → 403", async ({ studentRequest }) => {
    const exam = await seedExam({});

    const res = await studentRequest.get(
      `/api/exam/${exam.id}/sessions`
    );

    expect(res.status()).toBe(403);
  });
});
