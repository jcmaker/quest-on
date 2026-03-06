/**
 * Full Cross-Role E2E Simulation
 *
 * Runs instructor and student in two independent browser contexts,
 * testing the live interaction: join → wait → start → answer → submit → grade → report.
 *
 * Unlike grade-to-report.spec.ts (which pre-seeds everything), this test lets
 * the student actually join, wait in the waiting room, and watch the exam activate
 * in real-time after the instructor triggers the start.
 */
import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { TEST_STUDENT, TEST_INSTRUCTOR } from "../fixtures/auth-browser.fixture";
import { mockExternalRoutes } from "../helpers/mock-routes";
import {
  seedExam,
  seedStudentProfile,
  cleanupTestData,
  getSession,
  getSessionsByExam,
  getGrades,
} from "../../helpers/seed";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import {
  StudentExamPage,
  InstructorGradePage,
  StudentReportPage,
} from "../pages";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.test") });

const BYPASS_SECRET =
  process.env.TEST_BYPASS_SECRET ?? "e2e-test-bypass-token-2024";

/** Create a new page inside `ctx` with auth cookies + API header injection. */
async function createAuthPage(
  ctx: BrowserContext,
  user: typeof TEST_STUDENT | typeof TEST_INSTRUCTOR,
  baseURL: string,
): Promise<Page> {
  const page = await ctx.newPage();
  await mockExternalRoutes(page);

  await ctx.addCookies([
    { name: "__test_bypass", value: BYPASS_SECRET, url: baseURL },
    {
      name: "__test_user",
      value: encodeURIComponent(JSON.stringify(user)),
      url: baseURL,
    },
    {
      name: "__test_user_role",
      value: user.unsafeMetadata.role,
      url: baseURL,
    },
  ]);

  await page.route("**/api/**", (route) => {
    const headers = route.request().headers();
    return route.continue({
      headers: {
        ...headers,
        "x-test-user-id": user.id,
        "x-test-user-role": user.unsafeMetadata.role,
        "x-test-bypass-token": BYPASS_SECRET,
      },
    });
  });

  return page;
}

test.describe("Parallel Instructor + Student — Full Cross-Role E2E", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("join → wait → start → answer → submit → grade → report", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    const url = baseURL ?? "http://localhost:3000";
    const supabase = getTestSupabase();

    // ── Step 1: Seed exam (joinable, not yet started) & student profile ──
    const exam = await seedExam({ status: "joinable" });
    await seedStudentProfile(TEST_STUDENT.id);

    // ── Create two independent browser contexts (with baseURL) ──
    const studentCtx = await browser.newContext({ baseURL: url });
    const instructorCtx = await browser.newContext({ baseURL: url });
    const sPage = await createAuthPage(studentCtx, TEST_STUDENT, url);
    const iPage = await createAuthPage(instructorCtx, TEST_INSTRUCTOR, url);

    try {
      // ── Step 2: Student navigates to /exam/[code] ──
      // (Equivalent to going through /join → redirect; /join is covered by its own spec)
      const examPage = new StudentExamPage(sPage);
      await examPage.goto(exam.code);

      // ── Step 3: Accept preflight → land in waiting room ──
      await expect(examPage.preflightHeading).toBeVisible({ timeout: 15_000 });
      await examPage.acceptPreflight();
      await expect(examPage.waitingRoom).toBeVisible({ timeout: 15_000 });

      // Verify session created with "waiting" status in DB
      const sessions = await getSessionsByExam(exam.id);
      expect(sessions.length).toBe(1);
      const sessionId = sessions[0].id;

      await expect(async () => {
        const s = await getSession(sessionId);
        expect(s.status).toBe("waiting");
      }).toPass({ timeout: 10_000, intervals: [1_000] });

      // ── Step 4: Instructor starts exam (via API for atomic update) ──
      const startResponse = await iPage.request.post(
        `${url}/api/exam/${exam.id}/start`,
        {
          data: {},
          headers: {
            "Content-Type": "application/json",
            "x-test-user-id": TEST_INSTRUCTOR.id,
            "x-test-user-role": "instructor",
            "x-test-bypass-token": BYPASS_SECRET,
          },
        }
      );
      expect(startResponse.status()).toBe(200);

      // ── Step 5: Student exam activates — questions appear ──
      // WaitingRoom polls every 10s; generous timeout to allow detection
      await expect(
        sPage.getByText(/polymorphism|stack|queue/i),
      ).toBeVisible({ timeout: 30_000 });

      // ── Step 6: Student answers ALL questions ──
      // Q1: Polymorphism
      await expect(examPage.answerArea).toBeVisible({ timeout: 10_000 });
      await examPage.typeAnswer(
        "Polymorphism allows objects of different classes to be treated as objects of a common superclass.",
      );

      // Navigate to Q2 and answer it
      await examPage.nextBtn.click();
      await expect(examPage.answerArea).toBeVisible({ timeout: 5_000 });
      await examPage.typeAnswer(
        "A stack is LIFO (last in, first out) while a queue is FIFO (first in, first out).",
      );

      // Save all answers
      await examPage.manualSave();
      await expect(examPage.saveIndicator).toBeVisible({ timeout: 5_000 });

      // ── Step 7: Student submits exam ──
      await expect(examPage.submitBtn).toBeVisible({ timeout: 10_000 });
      await examPage.submitBtn.click();

      // Submit confirmation dialog (single dialog since all Qs are answered)
      const confirmBtn = sPage
        .locator('[role="alertdialog"], [role="dialog"]')
        .getByRole("button", { name: /제출하기/ });
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();

      // Wait for submission to complete — check submitted_at in DB
      // (The /api/feedback endpoint sets submitted_at, not status)
      await expect(async () => {
        const s = await getSession(sessionId);
        expect(s.submitted_at).not.toBeNull();
      }).toPass({ timeout: 20_000, intervals: [1_000] });

      // ── Step 8: Instructor navigates to grading page ──
      const gradePage = new InstructorGradePage(iPage);
      await gradePage.goto(exam.id, sessionId);

      await expect(
        iPage.getByRole("heading", { name: /채점/ }),
      ).toBeVisible({ timeout: 15_000 });

      // ── Step 9: Instructor grades the student ──
      await expect(gradePage.scoreInput).toBeVisible({ timeout: 10_000 });
      await gradePage.setScore("90");
      await gradePage.saveBtn.click();

      // Grade question 1 if navigation button is available
      const q1Nav = gradePage.questionNavButton(1);
      if (await q1Nav.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await q1Nav.click();
        await expect(gradePage.scoreInput).toBeVisible({ timeout: 5_000 });
        await gradePage.setScore("85");
        await gradePage.saveBtn.click();
      }

      // Verify grades persisted in DB
      await expect(async () => {
        const grades = await getGrades(sessionId);
        expect(grades.length).toBeGreaterThanOrEqual(1);
        const q0 = grades.find((g) => g.q_idx === 0);
        expect(q0).toBeDefined();
        expect(q0!.score).toBe(90);
      }).toPass({ timeout: 10_000, intervals: [1_000] });

      // ── Step 10: Student views report ──
      const reportPage = new StudentReportPage(sPage);
      await reportPage.goto(sessionId);

      await expect(
        sPage.getByRole("heading", { name: exam.title }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        sPage.getByText(/전체 점수:\s*90\/100점/),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await studentCtx.close();
      await instructorCtx.close();
    }
  });
});
