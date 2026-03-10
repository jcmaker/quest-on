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
import { InstructorGradePage } from "../pages";
import { TIMEOUTS } from "../../constants";

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
      timeout: TIMEOUTS.PAGE_LOAD,
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
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // Should show student list heading
    await expect(
      instructorPage.getByRole("heading", { name: /학생 목록/i }),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });

  test("grading page loads with question, answer, and grading panel", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Should show question prompt (scoped to rich-text container to avoid matching ai_context/answer)
    await expect(
      instructorPage.locator("[data-testid='rich-text-content']").getByText(/Question 1/i),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Should show student's answer
    await expect(
      instructorPage.getByText("Student 0 answer to question 1"),
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
  });

  test("instructor can input a grade score", async ({ instructorPage }) => {
    const { exam, students } = await seedInstructorGradingScenario();
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Find a score input field via data-testid
    await expect(gradePage.scoreInput).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await gradePage.setScore("85");
    await expect(gradePage.scoreInput).toHaveValue("85");
  });

  test("grading page allows navigation between questions", async ({
    instructorPage,
  }) => {
    const { exam, students } = await seedInstructorGradingScenario({
      questionCount: 2,
    });
    const session = students[0].session;

    const gradePage = new InstructorGradePage(instructorPage);
    await gradePage.goto(exam.id, session.id);

    // Wait for page to load — use question nav button
    await expect(gradePage.questionNavButton(0)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // Click on question 2 navigation
    await expect(gradePage.questionNavButton(1)).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
    await gradePage.questionNavButton(1).click();

    // Should show second question's content (scoped to rich-text container)
    await expect(
      instructorPage.locator("[data-testid='rich-text-content']").getByText(/Question 2/i),
    ).toBeVisible({ timeout: TIMEOUTS.API_RESPONSE });
  });
});
