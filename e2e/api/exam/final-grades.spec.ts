import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedGrade,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("GET /api/exam/[examId]/final-grades", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor gets final grades with manual grades", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 0, 85, "Good", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.grades).toHaveLength(1);
    expect(body.grades[0].session_id).toBe(session.id);
    expect(body.grades[0].score).toBe(85);
  });

  test("returns empty grades when no sessions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.grades).toEqual([]);
  });

  test("returns ai_graded entry when only auto grades exist", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 0, 90, "Auto graded", "auto");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.grades).toHaveLength(1);
    expect(body.grades[0].session_id).toBe(session.id);
    expect(body.grades[0].score).toBe(90);
    expect(body.grades[0].gradeStatus).toBe("ai_graded");
  });

  test("computes correct average across questions", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "student-1", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    await seedGrade(session.id, 0, 80, "Q1", "manual");
    await seedGrade(session.id, 1, 60, "Q2", "manual");

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.grades).toHaveLength(1);
    expect(body.grades[0].score).toBe(70); // (80 + 60) / 2
  });

  test("student cannot access final grades", async ({ studentRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await studentRequest.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(403);
  });

  test("anon cannot access final grades", async ({ anonRequest }) => {
    const exam = await seedExam({ status: "running" });

    const res = await anonRequest.get(`/api/exam/${exam.id}/final-grades`);

    expect(res.status()).toBe(401);
  });

  test("non-owner instructor cannot access final grades", async ({
    playwright,
  }) => {
    const exam = await seedExam({
      status: "running",
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

    const res = await otherInstructorReq.get(
      `/api/exam/${exam.id}/final-grades`
    );

    expect(res.status()).toBe(403);
    await otherInstructorReq.dispose();
  });
});
