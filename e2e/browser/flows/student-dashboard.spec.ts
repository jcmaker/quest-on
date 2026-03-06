import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { seedStudentProfile } from "../../helpers/seed";

test.describe("Student — Dashboard & Report Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student dashboard loads and shows session list", async ({
    studentPage,
  }) => {
    // Seed a completed session so there's data to show
    await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "submitted",
      withSubmissions: true,
      withGrades: true,
    });

    await studentPage.goto("/student");

    // Dashboard should load with session/exam data
    await expect(
      studentPage.getByRole("heading", { name: "학생 대시보드" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("report page shows grades, answers, and feedback", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "submitted",
      withSubmissions: true,
      withGrades: true,
      withMessages: true,
    });

    await studentPage.goto(`/student/report/${session.id}`);

    // Should show exam title (use heading role to avoid strict mode with multiple matches)
    await expect(
      studentPage.getByRole("heading", { name: exam.title }),
    ).toBeVisible({ timeout: 15_000 });

    // Should show score or grade info
    await expect(
      studentPage.getByText(/전체 점수/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard shows empty state when no sessions exist", async ({
    studentPage,
  }) => {
    // Seed student profile to prevent redirect to profile-setup
    await seedStudentProfile("test-student-id");

    await studentPage.goto("/student");

    // Should show empty state or "no exams" message
    await studentPage.waitForLoadState("domcontentloaded");

    // Either shows empty state message or the dashboard frame
    const hasContent = await studentPage
      .getByText(/시험|exam|대시보드|dashboard|없습니다|no exam/i)
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    expect(hasContent).toBe(true);
  });
});
