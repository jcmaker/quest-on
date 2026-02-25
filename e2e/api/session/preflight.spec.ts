import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
  getSession,
} from "../../helpers/seed";

test.describe("Session Preflight — POST /api/session/[sessionId]/preflight", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student accepts preflight → 200, status becomes waiting", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "joined",
    });

    const res = await studentRequest.post(
      `/api/session/${session.id}/preflight`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("waiting");
    expect(body.preflightAcceptedAt).toBeTruthy();

    // Verify DB
    const updated = await getSession(session.id);
    expect(updated.status).toBe("waiting");
    expect(updated.preflight_accepted_at).toBeTruthy();
  });

  test("different student cannot accept another's preflight → 403", async ({
    playwright,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "other-student-id", {
      status: "joined",
    });

    // Use a different student
    const otherStudentReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        Accept: "application/json",
      },
    });

    const res = await otherStudentReq.post(
      `/api/session/${session.id}/preflight`
    );

    expect(res.status()).toBe(403);
    await otherStudentReq.dispose();
  });

  test("unauthenticated → 401", async ({ anonRequest }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "student-1", {
      status: "joined",
    });

    const res = await anonRequest.post(
      `/api/session/${session.id}/preflight`
    );

    expect(res.status()).toBe(401);
  });

  test("invalid sessionId → 400", async ({ studentRequest }) => {
    const res = await studentRequest.post(
      "/api/session/not-a-uuid/preflight"
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_PARAM");
  });

  test("non-existent session → 404", async ({ studentRequest }) => {
    const res = await studentRequest.post(
      "/api/session/00000000-0000-0000-0000-000000000001/preflight"
    );

    expect(res.status()).toBe(404);
  });
});

test.describe("Session Detail — GET /api/session/[sessionId]", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student gets own session → 200 with details", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const res = await studentRequest.get(`/api/session/${session.id}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("unauthenticated → 401", async ({ anonRequest }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "student-1", {
      status: "in_progress",
    });

    const res = await anonRequest.get(`/api/session/${session.id}`);
    expect(res.status()).toBe(401);
  });
});
