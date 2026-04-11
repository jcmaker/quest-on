import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedGrade,
  cleanupTestData,
  getGrades,
} from "../../helpers/seed";

test.describe("POST /api/exam/[examId]/bulk-approve", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor bulk-approves auto grades → 200, grade_type becomes manual", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const s1 = await seedSession(exam.id, "student-1", { status: "submitted" });
    const s2 = await seedSession(exam.id, "student-2", { status: "submitted" });

    await seedGrade(s1.id, 0, 85, "Good work", "auto");
    await seedGrade(s2.id, 0, 72, "Acceptable", "auto");

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/bulk-approve`,
      {
        data: { sessionIds: [s1.id, s2.id] },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.approvedCount).toBe(2);

    // Verify DB: grade_type changed to manual
    const grades1 = await getGrades(s1.id);
    const grades2 = await getGrades(s2.id);
    expect(grades1.every((g: any) => g.grade_type === "manual")).toBe(true);
    expect(grades2.every((g: any) => g.grade_type === "manual")).toBe(true);
  });

  test("already manual grades are not counted → approvedCount 0", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({});
    const s1 = await seedSession(exam.id, "student-1", { status: "submitted" });
    await seedGrade(s1.id, 0, 90, "Perfect", "manual");

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/bulk-approve`,
      {
        data: { sessionIds: [s1.id] },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.approvedCount).toBe(0); // no auto grades to upgrade
  });

  test("student cannot bulk-approve → 403", async ({ studentRequest }) => {
    const exam = await seedExam({});
    const s1 = await seedSession(exam.id, "student-1", { status: "submitted" });

    const res = await studentRequest.post(
      `/api/exam/${exam.id}/bulk-approve`,
      {
        data: { sessionIds: [s1.id] },
      }
    );

    expect(res.status()).toBe(403);
  });

  test("unauthenticated request → 401", async ({ anonRequest }) => {
    const exam = await seedExam({});
    const s1 = await seedSession(exam.id, "student-1", { status: "submitted" });

    const res = await anonRequest.post(`/api/exam/${exam.id}/bulk-approve`, {
      data: { sessionIds: [s1.id] },
    });

    expect(res.status()).toBe(401);
  });

  test("non-owner instructor → 403", async ({ playwright }) => {
    const { BYPASS_SECRET } = await import("../../fixtures/auth.fixture");
    const exam = await seedExam({ instructor_id: "other-instructor-id" });
    const s1 = await seedSession(exam.id, "student-1", { status: "submitted" });

    const otherCtx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        "x-test-user-id": "test-instructor-id",
        "x-test-user-role": "instructor",
        "x-test-bypass-token": BYPASS_SECRET,
        Accept: "application/json",
      },
    });

    const res = await otherCtx.post(`/api/exam/${exam.id}/bulk-approve`, {
      data: { sessionIds: [s1.id] },
    });

    expect(res.status()).toBe(403);
    await otherCtx.dispose();
  });

  test("sessions not belonging to exam → 404", async ({ instructorRequest }) => {
    const exam = await seedExam({});
    const otherExam = await seedExam({ instructor_id: "test-instructor-id" });
    const foreignSession = await seedSession(otherExam.id, "student-1", {
      status: "submitted",
    });

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/bulk-approve`,
      {
        data: { sessionIds: [foreignSession.id] },
      }
    );

    expect(res.status()).toBe(404);
  });

  test("empty sessionIds array → 400", async ({ instructorRequest }) => {
    const exam = await seedExam({});

    const res = await instructorRequest.post(
      `/api/exam/${exam.id}/bulk-approve`,
      {
        data: { sessionIds: [] },
      }
    );

    expect(res.status()).toBe(400);
  });

  test("invalid exam UUID → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/exam/not-a-uuid/bulk-approve",
      {
        data: { sessionIds: ["00000000-0000-0000-0000-000000000001"] },
      }
    );

    expect(res.status()).toBe(400);
  });

  test("nonexistent exam → 404", async ({ instructorRequest }) => {
    const res = await instructorRequest.post(
      "/api/exam/00000000-0000-0000-0000-000000000000/bulk-approve",
      {
        data: {
          sessionIds: ["00000000-0000-0000-0000-000000000001"],
        },
      }
    );

    expect(res.status()).toBe(404);
  });
});
