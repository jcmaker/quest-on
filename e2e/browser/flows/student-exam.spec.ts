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

    await studentPage.goto(`/exam/${exam.code}`);

    // The page should load and show exam title or preflight content
    await expect(studentPage.locator("body")).not.toBeEmpty();
    // Preflight acceptance is needed for joined sessions
    await expect(
      studentPage.getByText(/시험 안내|preflight|시작/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows question panel after preflight is accepted (in_progress session)", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
      withSubmissions: false,
    });

    await studentPage.goto(`/exam/${exam.code}`);

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

    await studentPage.goto(`/exam/${exam.code}`);

    // Wait for first question to load
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to next question — button must be visible
    const nextBtn = studentPage.getByRole("button", { name: "다음 문제" });
    await expect(nextBtn).toBeVisible({ timeout: 10_000 });
    await nextBtn.click();
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

    await studentPage.goto(`/exam/${exam.code}`);

    // Wait for answer area to be available (use placeholder to avoid matching AI chat textarea)
    const answerArea = studentPage.getByPlaceholder(/답안을 작성/i);
    await expect(answerArea).toBeVisible({ timeout: 15_000 });

    // Type an answer
    await answerArea.click();
    await answerArea.fill("This is my test answer about polymorphism.");

    // Verify the text was entered
    await expect(answerArea).toHaveValue(/polymorphism/);
  });

  test("manual save with Ctrl+S triggers save indicator", async ({
    studentPage,
  }) => {
    const { exam, session } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "in_progress",
    });

    await studentPage.goto(`/exam/${exam.code}`);

    // Wait for the page to load
    await expect(
      studentPage.getByText(/polymorphism/i),
    ).toBeVisible({ timeout: 15_000 });

    // Type something in the answer area (use placeholder to avoid matching AI chat textarea)
    const answerArea = studentPage.getByPlaceholder(/답안을 작성/i);
    await expect(answerArea).toBeVisible({ timeout: 10_000 });
    await answerArea.click();
    await answerArea.fill("Test answer for save");

    // Trigger Ctrl+S
    await studentPage.keyboard.press("Control+s");

    // Should show saving/saved indicator
    await expect(
      studentPage.getByText(/저장|saving|saved/i).first(),
    ).toBeVisible({ timeout: 5_000 });

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

    await studentPage.goto(`/exam/${exam.code}`);

    // Find and click the submit button — must be visible
    const submitBtn = studentPage.getByRole("button", {
      name: /제출|submit/i,
    });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await submitBtn.click();

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

    await studentPage.goto(`/exam/${exam.code}`);

    // Should show a waiting state or message about exam not started
    await expect(
      studentPage.getByText(/대기|waiting|시작되지|not started/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows submitted state for already submitted session", async ({
    studentPage,
  }) => {
    const { exam } = await seedStudentExamScenario({
      examStatus: "running",
      sessionStatus: "submitted",
      withSubmissions: true,
    });

    await studentPage.goto(`/exam/${exam.code}`);

    // Should show submission complete or similar message
    await expect(
      studentPage.getByText(/제출 완료|submitted|완료/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
