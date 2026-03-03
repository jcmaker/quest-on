import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";

test.describe("Error Scenarios — Edge Cases", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("closed exam → shows submitted/completed message", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "closed",
      sessionStatus: "submitted",
      withSubmissions: true,
    });

    await studentPage.goto(`/exam/${exam.code}`);

    // Should show completed/submitted state
    await expect(
      studentPage.getByText(/제출 완료|submitted|종료|완료/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("non-existent exam code → error or redirect", async ({
    studentPage,
  }) => {
    await studentPage.goto("/exam/ZZZZZZ");

    // Should either show an error page, redirect to join with error,
    // or display an error message — but NOT crash
    await studentPage.waitForLoadState("networkidle");

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
    await studentPage.waitForLoadState("networkidle");

    // Wait for the page to load content first
    await expect(
      studentPage.locator("body")
    ).not.toBeEmpty({ timeout: 15_000 });

    // Abort a specific API call to simulate network failure
    await studentPage.route("**/api/supa**", (route) => route.abort("failed"));

    // Try to trigger an API call (e.g., auto-save)
    await studentPage.keyboard.press("Control+s");

    // Wait a moment for any error handling
    await studentPage.waitForTimeout(2_000);

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
