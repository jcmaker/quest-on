import { test, expect } from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { StudentExamPage } from "../pages";
import { getSession } from "../../helpers/seed";

test.describe("Full Exam Submission Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("student completes full exam submission: preflight → answer → submit", async ({
    studentPage,
  }) => {
    // 1. Seed a running exam with a joined (pre-preflight) session
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
      withSubmissions: false,
    });

    const examPage = new StudentExamPage(studentPage);

    // 2. Navigate to exam page
    await examPage.goto(exam.code);

    // 3. Accept preflight modal
    await expect(examPage.preflightHeading).toBeVisible({ timeout: 15_000 });
    await examPage.acceptPreflight();

    // 4. Wait for question content to appear after preflight acceptance
    await expect(
      studentPage.getByText(/polymorphism|stack|queue/i),
    ).toBeVisible({ timeout: 15_000 });

    // 5. Type an answer for the first question
    await expect(examPage.answerArea).toBeVisible({ timeout: 10_000 });
    await examPage.typeAnswer(
      "Polymorphism is a core OOP concept that allows objects to take many forms.",
    );

    // 6. Save the answer via Ctrl+S
    await examPage.manualSave();
    await expect(examPage.saveIndicator).toBeVisible({ timeout: 5_000 });

    // 7. Submit the exam
    await expect(examPage.submitBtn).toBeVisible({ timeout: 10_000 });
    await examPage.submitBtn.click();

    // 8. Confirm submission in the dialog
    const confirmBtn = studentPage
      .locator('[role="alertdialog"], [role="dialog"]')
      .getByRole("button", { name: /제출|submit|확인|confirm/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // 9. Verify session status is "submitted" in DB
    await expect(async () => {
      const updatedSession = await getSession(session.id);
      expect(updatedSession.status).toBe("submitted");
    }).toPass({ timeout: 15_000, intervals: [1_000] });
  });
});
