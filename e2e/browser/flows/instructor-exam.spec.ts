import {
  test,
  expect,
  TEST_INSTRUCTOR,
} from "../fixtures/auth-browser.fixture";
import {
  seedInstructorGradingScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { seedExam } from "../../helpers/seed";

test.describe("Instructor — Exam & Grading Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor dashboard shows exam list", async ({ instructorPage }) => {
    // Seed a couple of exams owned by the test instructor
    await seedExam({ title: "Midterm Exam", status: "running" });
    await seedExam({ title: "Final Exam", status: "draft" });

    await instructorPage.goto("/instructor");

    // Dashboard should load and show exam titles
    await expect(instructorPage.getByText(/Midterm Exam/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(instructorPage.getByText(/Final Exam/)).toBeVisible();
  });

  test("exam detail page shows student list and stats", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      studentCount: 1,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);

    // Should show exam title
    await expect(instructorPage.getByText(exam.title)).toBeVisible({
      timeout: 15_000,
    });

    // Should show student info or submission stats
    await expect(
      instructorPage.getByText(/제출|submitted|학생|student/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("grading page loads with question, answer, and grading panel", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    // URL param [studentId] actually expects the session UUID, not student_id string
    await instructorPage.goto(
      `/instructor/${exam.id}/grade/${session.id}`,
    );

    // Should show question prompt
    await expect(
      instructorPage.getByText(/Question 1|Explain/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Should show student's answer
    await expect(
      instructorPage.getByText(/Student 0 answer/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("instructor can input a grade score", async ({ instructorPage }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    await instructorPage.goto(
      `/instructor/${exam.id}/grade/${session.id}`,
    );

    // Find a score input field
    const scoreInput = instructorPage.locator(
      'input[type="number"], input[placeholder*="점수"], input[placeholder*="score"]',
    ).first();

    await expect(scoreInput).toBeVisible({ timeout: 10_000 });
    await scoreInput.fill("85");
    await expect(scoreInput).toHaveValue("85");
  });

  test("grading page allows navigation between questions", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 2,
    });
    const session = students[0].session;

    await instructorPage.goto(
      `/instructor/${exam.id}/grade/${session.id}`,
    );

    // Wait for page to load
    await expect(
      instructorPage.getByText(/Question 1|문제 1/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Click on question 2 navigation
    const q2Nav = instructorPage.getByText(/Question 2|문제 2|Q2/i).first();
    await expect(q2Nav).toBeVisible({ timeout: 5_000 });
    await q2Nav.click();

    // Should show second question's content
    await expect(
      instructorPage.getByText(/Question 2/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
