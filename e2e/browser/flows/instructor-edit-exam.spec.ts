import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { seedExam } from "../../helpers/seed";
import { InstructorEditExamPage } from "../pages";
import { TIMEOUTS } from "../../constants";

test.describe("Instructor — Edit Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("page loads with existing exam data", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "E2E Edit Test Exam",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    const editExam = new InstructorEditExamPage(instructorPage);
    await editExam.goto(exam.id);

    // Title input should have the existing value (skip networkidle — dev-mode HMR keeps connections open)
    await expect(editExam.titleInput).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });
    await expect(editExam.titleInput).toHaveValue("E2E Edit Test Exam");
  });

  test("edit title and save → success", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "Original Title",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    const editExam = new InstructorEditExamPage(instructorPage);
    await editExam.goto(exam.id);

    await expect(editExam.titleInput).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

    // Clear and type new title
    await editExam.titleInput.clear();
    await editExam.titleInput.fill("Updated Title via E2E");

    // Submit
    await expect(editExam.submitBtn).toBeEnabled();
    await editExam.submitBtn.click();

    // Should show success toast or redirect
    await expect(
      instructorPage.getByText(/수정.*완료|저장.*완료|성공/i)
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });
  });

  test("empty title → validation error", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "Title To Clear",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    const editExam = new InstructorEditExamPage(instructorPage);
    await editExam.goto(exam.id);

    await expect(editExam.titleInput).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

    // Clear title
    await editExam.titleInput.clear();

    await expect(editExam.submitBtn).toBeDisabled();
    await expect(editExam.submitDisabledReasons).toContainText("시험 제목을 입력해주세요");
  });

  test("cancel → redirect back to exam detail", async ({
    instructorPage,
  }) => {
    const exam = await seedExam({
      title: "Cancel Test Exam",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    const editExam = new InstructorEditExamPage(instructorPage);
    await editExam.goto(exam.id);

    // Wait for form to load before interacting
    await expect(editExam.cancelBtn).toBeVisible({ timeout: TIMEOUTS.AI_RESPONSE });

    // Click cancel button (try link first, then button)
    if (await editExam.cancelLink.isVisible({ timeout: TIMEOUTS.API_RESPONSE })) {
      await editExam.cancelLink.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: TIMEOUTS.ELEMENT_VISIBLE }
      );
      expect(instructorPage.url()).toContain("/instructor");
    } else {
      await editExam.cancelBtn.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: TIMEOUTS.ELEMENT_VISIBLE }
      );
      expect(instructorPage.url()).toContain("/instructor");
    }
  });
});
