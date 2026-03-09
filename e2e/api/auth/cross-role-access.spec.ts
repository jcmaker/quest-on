import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  cleanupTestData,
} from "../../helpers/seed";

test.describe("Cross-role access control", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Student trying instructor-only endpoints ──

  test("student cannot end exam → 403", async ({ studentRequest }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });

    const res = await studentRequest.post(`/api/exam/${exam.id}/end`, {
      data: {},
    });

    expect(res.status()).toBe(403);
  });

  test("student cannot access session grades → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await studentRequest.get(
      `/api/session/${session.id}/grade`
    );

    expect(res.status()).toBe(403);
  });

  test("student cannot access admin users → 401 or 403", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.get("/api/admin/users");

    // Admin routes use separate auth — student cookies won't pass
    expect([401, 403]).toContain(res.status());
  });

  test("student cannot access admin logs → 401 or 403", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.get("/api/admin/logs");

    expect([401, 403]).toContain(res.status());
  });

  // ── Anonymous user trying protected endpoints ──

  test("anon cannot end exam → 401", async ({ anonRequest }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });

    const res = await anonRequest.post(`/api/exam/${exam.id}/end`, {
      data: {},
    });

    expect(res.status()).toBe(401);
  });

  test("anon cannot access session grades → 401", async ({
    anonRequest,
  }) => {
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
    });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    const res = await anonRequest.get(
      `/api/session/${session.id}/grade`
    );

    expect(res.status()).toBe(401);
  });

  // ── Instructor accessing another instructor's resources ──

  test("instructor cannot end another instructor's exam → 403", async ({
    instructorRequest,
  }) => {
    // Exam owned by "other-instructor-id"
    const exam = await seedExam({
      status: "running",
      started_at: new Date().toISOString(),
      instructor_id: "other-instructor-id",
    });

    const res = await instructorRequest.post(`/api/exam/${exam.id}/end`, {
      data: {},
    });

    expect(res.status()).toBe(403);
  });

  test("instructor cannot list sessions of another instructor's exam → 403", async ({
    instructorRequest,
  }) => {
    const exam = await seedExam({
      instructor_id: "other-instructor-id",
    });

    const res = await instructorRequest.get(
      `/api/exam/${exam.id}/sessions`
    );

    expect(res.status()).toBe(403);
  });
});
