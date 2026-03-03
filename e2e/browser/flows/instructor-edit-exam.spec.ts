import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { seedExam } from "../../helpers/seed";
import { InstructorEditExamPage } from "../pages";

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
    await expect(editExam.titleInput).toBeVisible({ timeout: 30_000 });
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

    await expect(editExam.titleInput).toBeVisible({ timeout: 30_000 });

    // Clear and type new title
    await editExam.titleInput.clear();
    await editExam.titleInput.fill("Updated Title via E2E");

    // Submit
    await editExam.submitBtn.click();

    // Should show success toast or redirect
    await expect(
      instructorPage.getByText(/수정.*완료|저장.*완료|성공/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("empty title → validation error", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "Title To Clear",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    const editExam = new InstructorEditExamPage(instructorPage);
    await editExam.goto(exam.id);

    await expect(editExam.titleInput).toBeVisible({ timeout: 30_000 });

    // Clear title
    await editExam.titleInput.clear();

    // Submit
    await editExam.submitBtn.click();

    // Should show validation error about title
    await expect(
      instructorPage.getByText(/제목.*입력|시험 제목/i)
    ).toBeVisible({ timeout: 5_000 });
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
    await expect(editExam.cancelBtn).toBeVisible({ timeout: 30_000 });

    // Click cancel button (try link first, then button)
    if (await editExam.cancelLink.isVisible({ timeout: 5_000 })) {
      await editExam.cancelLink.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: 10_000 }
      );
      expect(instructorPage.url()).toContain("/instructor");
    } else {
      await editExam.cancelBtn.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: 10_000 }
      );
      expect(instructorPage.url()).toContain("/instructor");
    }
  });
});
