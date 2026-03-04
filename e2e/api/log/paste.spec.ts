import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("POST /api/log/paste", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Helper to build a valid paste payload ──

  function pastePayload(sessionId: string, overrides: Record<string, unknown> = {}) {
    return {
      length: 42,
      pasted_text: "Some pasted content",
      paste_start: 0,
      paste_end: 42,
      answer_length_before: 10,
      isInternal: false,
      ts: new Date().toISOString(),
      examCode: "TEST-CODE",
      questionId: 0,
      sessionId,
      ...overrides,
    };
  }

  // ── Success cases ──

  test("student logs paste event → 200", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/log/paste", {
      data: pastePayload(session.id),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("internal paste (isInternal=true) → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.post("/api/log/paste", {
      data: pastePayload(session.id, { isInternal: true }),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("long text truncation still returns 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    // Send text longer than 200 chars (the truncation limit in the route)
    const longText = "A".repeat(500);
    const res = await studentRequest.post("/api/log/paste", {
      data: pastePayload(session.id, {
        pasted_text: longText,
        length: longText.length,
      }),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ── Validation errors ──

  test("missing sessionId → 400", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/log/paste", {
      data: {
        length: 10,
        pasted_text: "test",
        isInternal: false,
        ts: new Date().toISOString(),
        examCode: "TEST",
        questionId: 0,
        // sessionId intentionally omitted
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("BAD_REQUEST");
  });

  // ── Auth / access control ──

  test("wrong session ownership → 403", async ({ playwright }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

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

    const res = await attackerReq.post("/api/log/paste", {
      data: pastePayload(session.id),
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
    await attackerReq.dispose();
  });

  test("anon → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/log/paste", {
      data: pastePayload("00000000-0000-0000-0000-000000000001"),
    });

    expect(res.status()).toBe(401);
  });

  test("non-existent session → 403", async ({ studentRequest }) => {
    // Session doesn't exist, so ownership check fails with 403 (not 404)
    // because the route returns FORBIDDEN when session is null or student_id doesn't match
    const res = await studentRequest.post("/api/log/paste", {
      data: pastePayload("00000000-0000-0000-0000-000000000001"),
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
  });
});
