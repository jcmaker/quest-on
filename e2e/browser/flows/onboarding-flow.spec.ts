import { Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { OnboardingPage, ProfileSetupPage } from "../pages";
import { TIMEOUTS } from "../../constants";

/** Mock the profile API to return no existing profile (GET) and accept saves (POST). */
async function setupProfileApiMock(page: Page) {
  await page.route("**/api/student/profile", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ profile: null }),
      });
    }
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
    return route.continue();
  });
}

test.describe("Onboarding — Role Selection", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("role selection page renders correctly", async ({ studentPage }) => {
    const onboarding = new OnboardingPage(studentPage);
    await onboarding.goto();
    // Should show welcome message
    await expect(onboarding.welcomeHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });

  test("student radio is default selected", async ({ studentPage }) => {
    const onboarding = new OnboardingPage(studentPage);
    await onboarding.goto();
    // Wait for the page to fully render
    await expect(onboarding.welcomeHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Student radio should be checked by default
    await expect(onboarding.studentRadio).toHaveAttribute("data-state", "checked");
  });

  test("instructor radio can be selected", async ({ studentPage }) => {
    const onboarding = new OnboardingPage(studentPage);
    await onboarding.goto();
    await expect(onboarding.welcomeHeading).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Click on instructor label/radio
    await onboarding.instructorLabel.click();

    // Instructor radio should now be checked
    await expect(onboarding.instructorRadio).toHaveAttribute("data-state", "checked");
  });
});

test.describe("Profile Setup — /student/profile-setup", () => {
  test.afterEach(async ({ studentPage }) => {
    await studentPage.unrouteAll({ behavior: "wait" });
    await cleanupTestData();
  });

  test("form fields render correctly", async ({ studentPage }) => {
    await setupProfileApiMock(studentPage);

    const profile = new ProfileSetupPage(studentPage);
    await profile.goto();
    // Should show form fields — name, student number, school
    await expect(profile.nameInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await expect(profile.studentNumberInput).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });

  test("empty name → submit button is disabled", async ({ studentPage }) => {
    await setupProfileApiMock(studentPage);

    const profile = new ProfileSetupPage(studentPage);
    await profile.goto();

    // Wait for form to be ready
    await expect(profile.nameInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Submit button should be disabled when name is empty
    await expect(profile.submitBtn).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await expect(profile.submitBtn).toBeDisabled();
  });

  test("valid input + submit → redirects to /student", async ({
    studentPage,
  }) => {
    await setupProfileApiMock(studentPage);

    // Mock university search API
    await studentPage.route("**/api/universities/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          universities: [
            {
              name: "서울대학교",
              type: "대학",
              category: "국립",
              branch: "본교",
              address: "서울특별시",
              fullName: "서울대학교",
            },
          ],
        }),
      })
    );

    const profile = new ProfileSetupPage(studentPage);
    await profile.goto();

    // Fill the form
    await expect(profile.nameInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
    await profile.nameInput.fill("테스트 학생");
    await profile.studentNumberInput.fill("2024-00001");

    // Fill school: type to trigger search, then select from dropdown
    await profile.schoolInput.fill("서울");
    // Wait for suggestions dropdown to appear
    const suggestion = studentPage.getByText("서울대학교");
    await expect(suggestion).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await suggestion.click();

    // Submit
    await expect(profile.submitBtn).toBeEnabled({ timeout: TIMEOUTS.API_RESPONSE });
    await profile.submitBtn.click();

    // Should redirect to student dashboard
    await studentPage.waitForURL(/\/student/, { timeout: TIMEOUTS.PAGE_LOAD });
    expect(studentPage.url()).toContain("/student");
  });
});
