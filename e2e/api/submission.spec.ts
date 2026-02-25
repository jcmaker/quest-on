import { test, expect } from "../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
} from "../helpers/seed";

test.describe("Submission — PATCH /api/submission/[submissionId]", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student saves student_reply by submissionId → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    const submission = await seedSubmission(session.id, 0);

    const res = await studentRequest.patch(
      `/api/submission/${submission.id}`,
      {
        data: {
          studentReply: "I think the answer needs more detail...",
          sessionId: session.id,
          qIdx: 0,
        },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission.student_reply).toBe(
      "I think the answer needs more detail..."
    );
  });

  test("student saves by sessionId + qIdx → 200", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0);

    // Use a dummy submissionId but provide sessionId+qIdx
    const res = await studentRequest.patch(
      `/api/submission/00000000-0000-0000-0000-000000000001`,
      {
        data: {
          studentReply: "Updated via sessionId+qIdx",
          sessionId: session.id,
          qIdx: 0,
        },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.submission.student_reply).toBe("Updated via sessionId+qIdx");
  });

  test("missing studentReply → 400", async ({ studentRequest }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    const submission = await seedSubmission(session.id, 0);

    const res = await studentRequest.patch(
      `/api/submission/${submission.id}`,
      {
        data: { sessionId: session.id },
      }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MISSING_REPLY");
  });

  test("optimistic lock conflict → 409", async ({ studentRequest }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });
    await seedSubmission(session.id, 0);

    // Pass a stale expectedUpdatedAt to trigger conflict
    const res = await studentRequest.patch(
      `/api/submission/00000000-0000-0000-0000-000000000001`,
      {
        data: {
          studentReply: "This should conflict",
          sessionId: session.id,
          qIdx: 0,
          expectedUpdatedAt: "2020-01-01T00:00:00.000Z", // stale timestamp
        },
      }
    );

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("CONFLICT");
  });

  test("unauthenticated → 401", async ({ anonRequest }) => {
    const res = await anonRequest.patch(
      "/api/submission/00000000-0000-0000-0000-000000000001",
      {
        data: { studentReply: "test" },
      }
    );

    expect(res.status()).toBe(401);
  });

  test("different student cannot update → 403", async ({ playwright }) => {
    const exam = await seedExam({});
    const session = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });
    const submission = await seedSubmission(session.id, 0);

    // Different student tries to update
    const attackerReq = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-student-id",
        "x-test-user-role": "student",
        Accept: "application/json",
      },
    });

    const res = await attackerReq.patch(
      `/api/submission/${submission.id}`,
      {
        data: {
          studentReply: "I am not the owner",
          sessionId: session.id,
          qIdx: 0,
        },
      }
    );

    expect(res.status()).toBe(403);
    await attackerReq.dispose();
  });
});
