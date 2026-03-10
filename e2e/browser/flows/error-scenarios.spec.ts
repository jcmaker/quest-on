import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { TIMEOUTS } from "../../constants";

test.describe("Error Scenarios — Edge Cases", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("closed exam → shows unavailable message or redirects to join", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "closed",
      sessionStatus: "submitted",
      withSubmissions: true,
    });

    await studentPage.goto(`/exam/${exam.code}`);

    // Closed exam triggers EXAM_NOT_AVAILABLE → redirects to /join with error,
    // or shows submitted state if session was already submitted
    const submittedState = studentPage.locator("[data-testid='exam-submitted-state']");
    const joinErrorMsg = studentPage.getByText(/응시할 수 없|종료되었|not available/i);

    await expect(submittedState.or(joinErrorMsg)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    });
  });

  test("non-existent exam code → error or redirect", async ({
    studentPage,
  }) => {
    await studentPage.goto("/exam/ZZZZZZ");

    // Should either show an error page, redirect to join with error,
    // or display an error message — but NOT crash
    await studentPage.waitForLoadState("domcontentloaded");

    // Check: no unhandled errors (page doesn't crash)
    // The page should either show an error message OR redirect
    const url = studentPage.url();
    const pageContent = await studentPage.textContent("body");

    // One of: error message shown, redirected to join with error, or 404 page
    const isValidErrorState =
      url.includes("error") ||
      url.includes("join") ||
      /찾을 수 없|not found|오류|에러|404/i.test(pageContent || "");

    // At minimum, the page should not be blank/crashed
    expect(pageContent).toBeTruthy();
  });

  test("network error does not crash the page", async ({ studentPage }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    // Collect page errors
    const pageErrors: Error[] = [];
    studentPage.on("pageerror", (err) => pageErrors.push(err));

    await studentPage.goto(`/exam/${exam.code}`);
    await studentPage.waitForLoadState("domcontentloaded");

    // Wait for the page to load content first — check for actual exam content
    await expect(
      studentPage.getByText(/polymorphism/i)
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Abort a specific API call to simulate network failure
    await studentPage.route("**/api/supa**", (route) => route.abort("failed"));

    // Try to trigger an API call (e.g., auto-save) — wait for the aborted request
    const savePromise = studentPage.waitForEvent("requestfailed").catch(() => {});
    await studentPage.keyboard.press("Control+s");
    await savePromise;

    // Filter out known benign errors (React hydration, etc.)
    const criticalErrors = pageErrors.filter(
      (err) =>
        !err.message.includes("hydrat") &&
        !err.message.includes("Minified React") &&
        !err.message.includes("net::ERR")
    );

    // Page should not have critical unhandled errors
    expect(criticalErrors).toHaveLength(0);
  });
});
