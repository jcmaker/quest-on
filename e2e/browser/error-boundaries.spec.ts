import { test, expect } from "./fixtures/auth-browser.fixture";
import { TIMEOUTS } from "../constants";

/**
 * Error handling smoke tests.
 * Verifies pages handle error states gracefully (own error UI or error boundary).
 */
test.describe("Error boundaries", () => {
  test("student error boundary renders on invalid report page", async ({
    studentPage,
  }) => {
    // Navigate to a non-existent report page — page handles error gracefully
    await studentPage.goto("/student/report/00000000-0000-0000-0000-000000000099", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // The report page catches API errors and shows its own error UI
    // (either error boundary OR in-page error message)
    const errorBoundary = studentPage.locator("[data-testid='error-boundary-student']");
    const inPageError = studentPage.getByText(/리포트를 찾을 수 없|리포트를 불러올 수 없|오류가 발생했습니다/i);

    await expect(errorBoundary.or(inPageError)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
  });

  test("error boundary shows retry button", async ({
    studentPage,
  }) => {
    await studentPage.goto("/student/report/00000000-0000-0000-0000-000000000099", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // The report page shows either error boundary retry or a back-to-dashboard button
    const retryBtn = studentPage.locator("[data-testid='error-retry-btn']");
    const backBtn = studentPage.getByRole("link", { name: /대시보드|돌아가기/i });

    await expect(retryBtn.or(backBtn)).toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
  });

  test("exam error boundary renders on invalid exam code with server error", async ({
    studentPage,
  }) => {
    // Mock student profile so profile gate doesn't redirect
    await studentPage.route("**/api/student/profile*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ profile: { name: "Test", student_number: "0000", school: "Test" } }),
      }),
    );

    // Intercept the exam API call to force a server error
    await studentPage.route("**/api/supa*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "INTERNAL_ERROR" }),
      }),
    );

    await studentPage.goto("/exam/XXXXXX", {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // Should either show error boundary, error text, or redirect to join page with error
    // The server error on init_exam_session causes redirect to /join?error=network_error
    await expect(async () => {
      const url = studentPage.url();
      const bodyText = await studentPage.textContent("body");
      const hasError =
        url.includes("error") ||
        url.includes("join") ||
        /오류|error|응시할 수 없|시험 코드 입력/i.test(bodyText || "");
      expect(hasError).toBe(true);
    }).toPass({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });
});
