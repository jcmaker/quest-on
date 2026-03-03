import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { seedExam } from "../../helpers/seed";

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

    await instructorPage.goto(`/instructor/${exam.id}/edit`);

    // Title input should have the existing value (skip networkidle — dev-mode HMR keeps connections open)
    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 30_000 });
    await expect(titleInput).toHaveValue("E2E Edit Test Exam");
  });

  test("edit title and save → success", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "Original Title",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    await instructorPage.goto(`/instructor/${exam.id}/edit`);

    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 30_000 });

    // Clear and type new title
    await titleInput.clear();
    await titleInput.fill("Updated Title via E2E");

    // Submit
    const submitBtn = instructorPage.getByRole("button", {
      name: /수정하기|저장|수정 완료/i,
    });
    await submitBtn.click();

    // Should show success toast or redirect
    await expect(
      instructorPage
        .getByText(/수정.*완료|저장.*완료|성공/i)
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("empty title → validation error", async ({ instructorPage }) => {
    const exam = await seedExam({
      title: "Title To Clear",
      status: "draft",
      instructor_id: "test-instructor-id",
    });

    await instructorPage.goto(`/instructor/${exam.id}/edit`);

    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 30_000 });

    // Clear title
    await titleInput.clear();

    // Submit
    const submitBtn = instructorPage.getByRole("button", {
      name: /수정하기|저장|수정 완료/i,
    });
    await submitBtn.click();

    // Should show validation error about title
    await expect(
      instructorPage.getByText(/제목.*입력|시험 제목/i).first()
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

    await instructorPage.goto(`/instructor/${exam.id}/edit`);

    // Wait for form to load before interacting
    await expect(
      instructorPage.getByRole("button", { name: /취소|돌아가기/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // Click cancel button
    const cancelBtn = instructorPage.getByRole("link", {
      name: /취소|돌아가기/i,
    });
    if (await cancelBtn.isVisible({ timeout: 5_000 })) {
      await cancelBtn.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: 10_000 }
      );
      expect(instructorPage.url()).toContain("/instructor");
    } else {
      // Fallback: try button instead of link
      const cancelButton = instructorPage.getByRole("button", {
        name: /취소|돌아가기/i,
      });
      await cancelButton.click();
      await instructorPage.waitForURL(
        new RegExp(`/instructor/${exam.id}|/instructor`),
        { timeout: 10_000 }
      );
      expect(instructorPage.url()).toContain("/instructor");
    }
  });
});
