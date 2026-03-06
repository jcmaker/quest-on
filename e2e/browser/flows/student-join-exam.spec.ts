import { test, expect } from "../fixtures/auth-browser.fixture";
import { seedStudentExamScenario, cleanupTestData } from "../helpers/test-data-builder";

test.describe("Student — Join Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("mobile join input exposes text keyboard hints and uppercases letters", async ({
    studentPage,
  }) => {
    await studentPage.setViewportSize({ width: 390, height: 844 });
    await studentPage.goto("/join");
    await studentPage.waitForLoadState("domcontentloaded");

    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await expect(otpInput).toHaveAttribute("inputmode", "text");
    await expect(otpInput).toHaveAttribute("autocapitalize", "characters");
    await expect(otpInput).toHaveAttribute("spellcheck", "false");

    await otpInput.click();
    await studentPage.keyboard.type("math0");

    await expect(otpInput).toHaveValue("MATH0");
  });

  test("valid 6-char code → shows instructions dialog", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
    });

    await studentPage.goto("/join");
    await studentPage.waitForLoadState("domcontentloaded");

    // Type the exam code into the OTP input
    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await otpInput.click();
    await studentPage.keyboard.type(exam.code);

    await studentPage.waitForURL(new RegExp(`/exam/${exam.code}`), {
      timeout: 10_000,
    });

    // Instructions dialog should appear
    await expect(
      studentPage.getByRole("dialog", { name: /시험 시작 전 안내사항/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("confirm dialog → navigates to /exam/{code}", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
    });

    await studentPage.goto("/join");
    await studentPage.waitForLoadState("domcontentloaded");

    // Enter code and submit
    const otpInput = studentPage.locator("[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 10_000 });
    await otpInput.click();
    await studentPage.keyboard.type(exam.code);

    await studentPage.waitForURL(new RegExp(`/exam/${exam.code}`), {
      timeout: 10_000,
    });

    // Wait for dialog, then click confirm
    await expect(
      studentPage.getByRole("dialog", { name: /시험 시작 전 안내사항/i })
    ).toBeVisible({ timeout: 10_000 });

    await studentPage.getByTestId("preflight-rules-checkbox").click();
    await studentPage.getByTestId("preflight-ailog-checkbox").click();

    const confirmBtn = studentPage.getByTestId("preflight-accept-btn");
    await confirmBtn.click();

    await expect(
      studentPage.getByRole("dialog", { name: /시험 시작 전 안내사항/i })
    ).toBeHidden({ timeout: 10_000 });
    await expect(studentPage.getByRole("button", { name: /시험 제출하기/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("less than 6 chars → submit button disabled", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join");
    await studentPage.waitForLoadState("domcontentloaded");

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
    await studentPage.waitForLoadState("domcontentloaded");

    await expect(
      studentPage.getByText(/이미 제출/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=exam_not_found → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=exam_not_found");
    await studentPage.waitForLoadState("domcontentloaded");

    await expect(
      studentPage.getByText(/찾을 수 없습니다/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=exam_not_available → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=exam_not_available");
    await studentPage.waitForLoadState("domcontentloaded");

    await expect(
      studentPage.getByText(/응시할 수 없/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("error=entry_window_closed → shows error message", async ({
    studentPage,
  }) => {
    await studentPage.goto("/join?error=entry_window_closed");
    await studentPage.waitForLoadState("domcontentloaded");

    await expect(
      studentPage.getByText(/마감/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
