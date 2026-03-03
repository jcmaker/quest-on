import {
  test,
  expect,
  TEST_STUDENT,
} from "../fixtures/auth-browser.fixture";
import {
  seedStudentExamScenario,
  cleanupTestData,
} from "../helpers/test-data-builder";
import { getTestSupabase } from "../../helpers/supabase-test-client";
import { StudentExamPage } from "../pages";

const supabase = getTestSupabase();

test.describe("Student — Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("loads exam page and shows preflight modal for waiting session", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "joined",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Preflight acceptance is needed for joined sessions
    await expect(examPage.preflightHeading).toBeVisible({ timeout: 10_000 });
  });

  test("shows question panel after preflight is accepted (in_progress session)", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
      withSubmissions: false,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show the question content
    await expect(
      studentPage.getByText(/polymorphism|stack|queue/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("navigates between questions using prev/next buttons", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for first question to load
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to next question — button must be visible
    await expect(examPage.nextBtn).toBeVisible({ timeout: 10_000 });
    await examPage.nextBtn.click();
    // Second question should show
    await expect(
      studentPage.getByText(/stack|queue/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can type an answer in the answer panel", async ({ studentPage }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for answer area to be available
    await expect(examPage.answerArea).toBeVisible({ timeout: 15_000 });

    // Type an answer
    await examPage.typeAnswer("This is my test answer about polymorphism.");

    // Verify the text was entered
    await expect(examPage.answerArea).toHaveValue(/polymorphism/);
  });

  test("manual save with Ctrl+S triggers save indicator", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Wait for the page to load
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: 15_000 });

    // Type something in the answer area
    await expect(examPage.answerArea).toBeVisible({ timeout: 10_000 });
    await examPage.typeAnswer("Test answer for save");

    // Trigger Ctrl+S
    await examPage.manualSave();

    // Should show saving/saved indicator via data-testid
    await expect(examPage.saveIndicator).toBeVisible({ timeout: 5_000 });

    // Verify draft was saved to DB (poll until persisted)
    await expect(async () => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("session_id", session.id)
        .eq("q_idx", 0);
      expect(data!.length).toBeGreaterThan(0);
      expect(data![0].answer).toContain("Test answer for save");
    }).toPass({ timeout: 5_000, intervals: [500] });
  });

  test("submit button shows confirmation dialog", async ({ studentPage }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
      withSubmissions: true,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Find and click the submit button — must be visible
    await expect(examPage.submitBtn).toBeVisible({ timeout: 10_000 });
    await examPage.submitBtn.click();

    // Confirmation dialog should appear
    await expect(
      studentPage.getByText(/제출하시겠습니까|수정할 수 없|cannot modify/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows waiting room when exam is not started", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "draft",
      sessionStatus: "waiting",
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show waiting room via data-testid
    await expect(examPage.waitingRoom).toBeVisible({ timeout: 15_000 });
  });

  test("shows submitted state for already submitted session", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "submitted",
      withSubmissions: true,
    });

    const examPage = new StudentExamPage(studentPage);
    await examPage.goto(exam.code);

    // Should show submission complete message
    await expect(
      studentPage.getByText(/제출.*완료/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
