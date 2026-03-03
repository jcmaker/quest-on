import { test, expect } from "../fixtures/auth-browser.fixture";
import { seedStudentExamScenario, cleanupTestData } from "../helpers/test-data-builder";

test.describe("Student — Join Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("valid 6-char code → shows instructions dialog", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    await studentPage.goto("/join");
    await studentPage.waitForLoadState("networkidle");

    // Type the exam code into the OTP input
    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await otpInput.click();
    await studentPage.keyboard.type(exam.code);

    // Submit the form
    const submitBtn = studentPage.getByRole("button", {
      name: /시험 입장|입장/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Instructions dialog should appear
    await expect(
      studentPage.getByText(/학생 지침/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("confirm dialog → navigates to /exam/{code}", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    await studentPage.goto("/join");
    await studentPage.waitForLoadState("networkidle");

    // Enter code and submit
    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await otpInput.click();
    await studentPage.keyboard.type(exam.code);

    const submitBtn = studentPage.getByRole("button", {
      name: /시험 입장|입장/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Wait for dialog, then click confirm
    await expect(
      studentPage.getByText(/학생 지침/i)
    ).toBeVisible({ timeout: 10_000 });

    const confirmBtn = studentPage.getByRole("button", {
      name: /확인.*시험 시작|시작/i,
    });
    await confirmBtn.click();

    // Should navigate to exam page
    await studentPage.waitForURL(/\/exam\//, { timeout: 15_000 });
    expect(studentPage.url()).toContain("/exam/");
  });

  test("less than 6 chars → submit button disabled", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join");
    await studentPage.waitForLoadState("networkidle");

    // Type only 3 characters
    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await otpInput.click();
    await studentPage.keyboard.type("ABC");

    // Submit button should be disabled
    const submitBtn = studentPage.getByRole("button", {
      name: /시험 입장|입장/i,
    });
    await expect(submitBtn).toBeDisabled();
  });

  test("error=already_submitted → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=already_submitted");
    await studentPage.waitForLoadState("networkidle");

    await expect(
      studentPage.getByText(/이미 제출/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=exam_not_found → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=exam_not_found");
    await studentPage.waitForLoadState("networkidle");

    await expect(
      studentPage.getByText(/찾을 수 없습니다/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=exam_not_available → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=exam_not_available");
    await studentPage.waitForLoadState("networkidle");

    await expect(
      studentPage.getByText(/응시할 수 없/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=entry_window_closed → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=entry_window_closed");
    await studentPage.waitForLoadState("networkidle");

    await expect(
      studentPage.getByText(/마감/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
