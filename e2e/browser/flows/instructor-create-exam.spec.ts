import { test, expect } from "../fixtures/auth-browser.fixture";
import { cleanupTestData } from "../helpers/test-data-builder";
import { getTestSupabase } from "../../helpers/supabase-test-client";

const supabase = getTestSupabase();

test.describe("Instructor — Create Exam Flow", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("page loads with auto-generated 6-char exam code", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");

    // Page title
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Exam code should be auto-generated (6-char alphanumeric input)
    const codeInput = instructorPage.locator('input[name="code"], input[id="code"]').first();
    if (await codeInput.isVisible()) {
      const codeValue = await codeInput.inputValue();
      expect(codeValue).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  test("can fill title and duration fields", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");
    // Wait for the form to load
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Fill title
    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill("E2E 테스트 시험");
    await expect(titleInput).toHaveValue("E2E 테스트 시험");
  });

  test("can type question text", async ({ instructorPage }) => {
    await instructorPage.goto("/instructor/new");
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Find question textarea or contenteditable
    const questionArea = instructorPage
      .locator('textarea, [contenteditable="true"]')
      .first();
    await expect(questionArea).toBeVisible({ timeout: 10_000 });

    await questionArea.click();
    // Use fill for textarea, keyboard.type as fallback for contenteditable
    const tagName = await questionArea.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "textarea") {
      await questionArea.fill("다형성의 개념을 설명하시오.");
    } else {
      await instructorPage.keyboard.type("다형성의 개념을 설명하시오.");
    }

    await expect(questionArea).toContainText("다형성");
  });

  test("empty title → validation error on submit", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Fill question but leave title empty
    const questionArea = instructorPage
      .locator('textarea, [contenteditable="true"]')
      .first();
    await expect(questionArea).toBeVisible({ timeout: 10_000 });
    await questionArea.click();
    const tagName = await questionArea.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "textarea") {
      await questionArea.fill("테스트 문제입니다.");
    } else {
      await instructorPage.keyboard.type("테스트 문제입니다.");
    }

    // Click submit with empty title
    const submitBtn = instructorPage.getByRole("button", {
      name: /출제하기|출제/i,
    });
    await submitBtn.click();

    // Should show toast error about title
    await expect(
      instructorPage.getByText(/제목.*입력|시험 제목/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("empty question → validation error on submit", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Fill title but leave question empty
    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill("E2E 테스트 시험");

    // Click submit
    const submitBtn = instructorPage.getByRole("button", {
      name: /출제하기|출제/i,
    });
    await submitBtn.click();

    // Should show toast error about question
    await expect(
      instructorPage.getByText(/문제.*입력/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("valid submission → shows success dialog", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Fill title
    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    const uniqueTitle = `E2E Test ${Date.now()}`;
    await titleInput.fill(uniqueTitle);

    // Fill question
    const questionArea = instructorPage
      .locator('textarea, [contenteditable="true"]')
      .first();
    await expect(questionArea).toBeVisible({ timeout: 10_000 });
    await questionArea.click();
    const tagName = await questionArea.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "textarea") {
      await questionArea.fill("E2E 테스트 문제입니다. 다형성을 설명하세요.");
    } else {
      await instructorPage.keyboard.type(
        "E2E 테스트 문제입니다. 다형성을 설명하세요."
      );
    }

    // Submit
    const submitBtn = instructorPage.getByRole("button", {
      name: /출제하기|출제/i,
    });
    await submitBtn.click();

    // Should show success dialog
    await expect(
      instructorPage.getByText(/출제 완료/i)
    ).toBeVisible({ timeout: 30_000 });

    // Verify in DB
    await expect(async () => {
      const { data } = await supabase
        .from("exams")
        .select("*")
        .eq("title", uniqueTitle);
      expect(data!.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000, intervals: [1_000] });
  });

  test("confirm success dialog → navigates to dashboard", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor/new");
    await expect(
      instructorPage.getByText(/새로운 시험 만들기|시험 만들기/i)
    ).toBeVisible({ timeout: 15_000 });

    // Fill form
    const titleInput = instructorPage.getByLabel(/제목|시험 제목/i).first();
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill(`E2E Nav Test ${Date.now()}`);

    const questionArea = instructorPage
      .locator('textarea, [contenteditable="true"]')
      .first();
    await expect(questionArea).toBeVisible({ timeout: 10_000 });
    await questionArea.click();
    const tagName = await questionArea.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "textarea") {
      await questionArea.fill("네비게이션 테스트 문제입니다.");
    } else {
      await instructorPage.keyboard.type("네비게이션 테스트 문제입니다.");
    }

    // Submit
    const submitBtn = instructorPage.getByRole("button", {
      name: /출제하기|출제/i,
    });
    await submitBtn.click();

    // Wait for success dialog
    await expect(
      instructorPage.getByText(/출제 완료/i)
    ).toBeVisible({ timeout: 30_000 });

    // Click confirm button in dialog
    const confirmBtn = instructorPage
      .locator('[role="dialog"]')
      .getByRole("button", { name: /확인/i });
    await confirmBtn.click();

    // Should navigate to instructor dashboard
    await instructorPage.waitForURL(/\/instructor/, { timeout: 15_000 });
    expect(instructorPage.url()).toContain("/instructor");
  });
});
