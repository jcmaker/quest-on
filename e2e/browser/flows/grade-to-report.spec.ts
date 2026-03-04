import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedInstructorGradingScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { InstructorGradePage, StudentReportPage } from "../pages";
import { getGrades } from "../../helpers/seed";

test.describe("Grade to Report — Cross-Role Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor grades submissions, student sees scores on report page", async ({
    instructorPage,
    studentPage,
  }) => {
    // 1. Seed a grading scenario with 2 questions and 1 student
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 2,
      studentCount: 1,
    });
    const { session } = students[0];

    // 2. Instructor navigates to grading page for the student
    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // 3. Wait for grading page to load
    await expect(
      instructorPage.getByText(/채점|grade|점수/i),
    ).toBeVisible({ timeout: 15_000 });

    // 4. Enter score for question 0 via UI
    await expect(gradePage.scoreInput).toBeVisible({ timeout: 10_000 });
    await gradePage.setScore("90");
    await gradePage.saveBtn.click();

    // 5. Navigate to question 1 and grade it
    const q1Nav = gradePage.questionNavButton(1);
    if (await q1Nav.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await q1Nav.click();
      await expect(gradePage.scoreInput).toBeVisible({ timeout: 5_000 });
      await gradePage.setScore("85");
      await gradePage.saveBtn.click();
    }

    // 6. Verify grades are persisted in DB
    await expect(async () => {
      const grades = await getGrades(session.id);
      expect(grades.length).toBeGreaterThanOrEqual(1);
      const q0Grade = grades.find((g) => g.q_idx === 0);
      expect(q0Grade).toBeDefined();
      expect(q0Grade!.score).toBe(90);
    }).toPass({ timeout: 10_000, intervals: [1_000] });

    // 7. Student navigates to report page for their session
    const reportPage = new StudentReportPage(studentPage);
    await reportPage.goto(session.id);

    // 8. Verify exam title is displayed on the report page
    await expect(
      studentPage.getByText(exam.title),
    ).toBeVisible({ timeout: 15_000 });

    // 9. Verify score information is visible on the report
    await expect(
      studentPage.getByText(/점수|score|전체 점수|90/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
