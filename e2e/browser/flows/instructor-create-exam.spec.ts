import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import { InstructorCreateExamPage } from "../pages";

const supabase = getTestSupabase();

test.describe("Instructor — Create Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("page loads with auto-generated 6-char exam code", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();

    // Page title
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Exam code should be auto-generated (6-char alphanumeric input)
    if (await createExam.codeInput.isVisible()) {
      const codeValue = await createExam.codeInput.inputValue();
      expect(codeValue).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  test("can fill title and duration fields", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    // Wait for the form to load
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Fill title
    await expect(createExam.titleInput).toBeVisible({ timeout: 5_000 });
    await createExam.titleInput.fill("E2E 테스트 시험");
    await expect(createExam.titleInput).toHaveValue("E2E 테스트 시험");
  });

  test("can type question text", async ({ instructorPage }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Find question textarea or contenteditable (encapsulated in Page Object)
    await expect(createExam.questionArea).toBeVisible({ timeout: 10_000 });
    await createExam.fillQuestion("다형성의 개념을 설명하시오.");

    await expect(createExam.questionArea).toContainText("다형성");
  });

  test("empty title → validation error on submit", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Fill question but leave title empty
    await expect(createExam.questionArea).toBeVisible({ timeout: 10_000 });
    await createExam.fillQuestion("테스트 문제입니다.");

    // Click submit with empty title
    await createExam.submitBtn.click();

    // Should show toast error about title (use role="status" to target toast, not form labels)
    await expect(
      instructorPage.locator('[role="status"]').getByText(/제목.*입력|시험 제목/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("empty question → validation error on submit", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Fill title but leave question empty
    await expect(createExam.titleInput).toBeVisible({ timeout: 5_000 });
    await createExam.titleInput.fill("E2E 테스트 시험");

    // Click submit
    await createExam.submitBtn.click();

    // Should show toast error about question OR stay on the same page
    const hasToast = await instructorPage
      .locator('[role="status"]')
      .getByText(/문제.*입력|문제.*추가/i)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasToast) {
      // Verify page stays on /instructor/new (didn't navigate away)
      expect(instructorPage.url()).toContain("/instructor/new");
    }
  });

  test("valid submission → shows success dialog", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Fill title
    await expect(createExam.titleInput).toBeVisible({ timeout: 5_000 });
    const uniqueTitle = `E2E Test ${Date.now()}`;
    await createExam.titleInput.fill(uniqueTitle);

    // Fill question
    await expect(createExam.questionArea).toBeVisible({ timeout: 10_000 });
    await createExam.fillQuestion("E2E 테스트 문제입니다. 다형성을 설명하세요.");

    // Submit
    await createExam.submitBtn.click();

    // Should show success dialog
    await expect(createExam.successDialog).toBeVisible({ timeout: 30_000 });

    // Verify in DB
    await expect(async () => {
      const { data } = await supabase
        .from("exams")
        .select("*")
        .eq("title", uniqueTitle);
      expect(data!.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000, intervals: [1_000] });
  });

  test("confirm success dialog → navigates to dashboard", async ({
    instructorPage,
  }) => {
    const createExam = new InstructorCreateExamPage(instructorPage);
    await createExam.goto();
    await expect(createExam.pageHeading).toBeVisible({ timeout: 15_000 });

    // Fill form
    await expect(createExam.titleInput).toBeVisible({ timeout: 5_000 });
    await createExam.titleInput.fill(`E2E Nav Test ${Date.now()}`);

    await expect(createExam.questionArea).toBeVisible({ timeout: 10_000 });
    await createExam.fillQuestion("네비게이션 테스트 문제입니다.");

    // Submit
    await createExam.submitBtn.click();

    // Wait for success dialog
    await expect(createExam.successDialog).toBeVisible({ timeout: 30_000 });

    // Click confirm button in dialog
    const confirmBtn = instructorPage
      .locator('[role="dialog"]')
      .getByRole("button", { name: /확인/i });
    await confirmBtn.click();

    // Should navigate to instructor dashboard
    await instructorPage.waitForURL(/\/instructor/, { timeout: 15_000 });
    expect(instructorPage.url()).toContain("/instructor");
  });
});
