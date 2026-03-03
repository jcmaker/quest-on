import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";

test.describe("Onboarding — Role Selection", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("role selection page renders correctly", async ({ studentPage }) => {
    await studentPage.goto("/onboarding");
    // Should show welcome message
    await expect(
      studentPage.getByText(/환영합니다|역할.*선택/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("student radio is default selected", async ({ studentPage }) => {
    await studentPage.goto("/onboarding");
    // Wait for the page to fully render
    await expect(
      studentPage.getByText(/환영합니다|역할.*선택/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Student radio should be checked by default
    const studentRadio = studentPage.locator('button[role="radio"][value="student"]');
    await expect(studentRadio).toHaveAttribute("data-state", "checked");
  });

  test("instructor radio can be selected", async ({ studentPage }) => {
    await studentPage.goto("/onboarding");
    await expect(
      studentPage.getByText(/환영합니다|역할.*선택/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Click on instructor label/radio
    const instructorLabel = studentPage.getByText(/강사|시험 출제자/i);
    await instructorLabel.click();

    // Instructor radio should now be checked
    const instructorRadio = studentPage.locator('button[role="radio"][value="instructor"]');
    await expect(instructorRadio).toHaveAttribute("data-state", "checked");
  });
});

test.describe("Profile Setup — /student/profile-setup", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("form fields render correctly", async ({ studentPage }) => {
    // Mock the profile API to return no existing profile
    await studentPage.route("**/api/student/profile", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ profile: null }),
        });
      }
      return route.continue();
    });

    await studentPage.goto("/student/profile-setup");
    // Should show form fields — name, student number, school
    await expect(
      studentPage.getByLabel(/이름|name/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      studentPage.getByLabel(/학번|student.*number/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("empty name → submit button is disabled", async ({ studentPage }) => {
    // Mock the profile API
    await studentPage.route("**/api/student/profile", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ profile: null }),
        });
      }
      return route.continue();
    });

    await studentPage.goto("/student/profile-setup");

    // Wait for form to be ready
    await expect(
      studentPage.getByLabel(/이름|name/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Submit button should be disabled when name is empty
    const submitBtn = studentPage.getByRole("button", {
      name: /저장|완료|시작|설정 완료|프로필/i,
    });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await expect(submitBtn).toBeDisabled();
  });

  test("valid input + submit → redirects to /student", async ({
    studentPage,
  }) => {
    // Mock the profile API
    await studentPage.route("**/api/student/profile", (route) => {
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

    await studentPage.goto("/student/profile-setup");

    // Fill the form
    const nameInput = studentPage.getByLabel(/이름|name/i).first();
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill("테스트 학생");

    const studentNumInput = studentPage.getByLabel(/학번|student.*number/i).first();
    await studentNumInput.fill("2024-00001");

    // Fill school: type to trigger search, then select from dropdown
    const schoolInput = studentPage.getByLabel(/학교|school/i).first();
    await schoolInput.fill("서울");
    // Wait for suggestions dropdown to appear
    const suggestion = studentPage.getByText("서울대학교").first();
    await expect(suggestion).toBeVisible({ timeout: 5_000 });
    await suggestion.click();

    // Submit
    const submitBtn = studentPage.getByRole("button", {
      name: /저장|완료|시작|설정 완료|프로필/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Should redirect to student dashboard
    await studentPage.waitForURL(/\/student/, { timeout: 15_000 });
    expect(studentPage.url()).toContain("/student");
  });
});
