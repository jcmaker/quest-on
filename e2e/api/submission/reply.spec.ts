import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("POST /api/submission/reply", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Success cases ──

  test("student replies to own submission → 200 with submission object", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0, { answer: "Original answer" });

    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "I want to clarify my answer further.",
        sessionId: session.id,
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission).toBeDefined();
    expect(body.submission.student_reply).toBe(
      "I want to clarify my answer further."
    );
    expect(body.submission.session_id).toBe(session.id);
    expect(body.submission.q_idx).toBe(0);
  });

  test("creates new submission if none exists → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    // No seedSubmission — reply should create one

    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Reply with no prior submission",
        sessionId: session.id,
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission).toBeDefined();
    expect(body.submission.student_reply).toBe(
      "Reply with no prior submission"
    );
  });

  test("student replies to second question → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 1, { answer: "Data structures answer" });

    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Adding more detail about queues.",
        sessionId: session.id,
        qIdx: 1,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission.q_idx).toBe(1);
  });

  // ── Validation errors ──

  test("missing studentReply → 400 MISSING_FIELDS", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        sessionId: session.id,
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_FIELDS");
  });

  test("missing sessionId → 400 MISSING_FIELDS", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Some reply",
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_FIELDS");
  });

  test("missing qIdx → 400 MISSING_FIELDS", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Some reply",
        sessionId: session.id,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_FIELDS");
  });

  test("invalid session UUID → 400 INVALID_SESSION_ID", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Some reply",
        sessionId: "not-a-uuid",
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SESSION_ID");
  });

  // ── Auth / access control ──

  test("student tries different student's session → 403", async ({
    playwright,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0);

    // Request as test-student-id (not the session owner)
    const attackerReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const res = await attackerReq.post("/api/submission/reply", {
      data: {
        studentReply: "I am not the owner",
        sessionId: session.id,
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCESS_DENIED");
    await attackerReq.dispose();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Some reply",
        sessionId: "00000000-0000-0000-0000-000000000001",
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(401);
  });

  test("non-existent session → 404", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/submission/reply", {
      data: {
        studentReply: "Reply to nowhere",
        sessionId: "00000000-0000-0000-0000-000000000001",
        qIdx: 0,
      },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("SESSION_NOT_FOUND");
  });
});
