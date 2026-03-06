import { Page, Locator } from "@playwright/test";

export class InstructorCreateExamPage {
  constructor(private page: Page) {}

  get pageHeading(): Locator {
    return this.page.getByText(/새로운 시험 만들기|시험 만들기/i);
  }

  get titleInput(): Locator {
    return this.page.getByLabel("시험 제목");
  }

  get codeInput(): Locator {
    return this.page.locator("#code");
  }

  get manualQuestionsToggle(): Locator {
    return this.page.getByTestId("manual-questions-toggle");
  }

  get addQuestionBtn(): Locator {
    return this.page.locator(
      '[data-testid="add-question-btn"], [data-testid="empty-add-question-btn"]'
    );
  }

  questionArea(index = 0): Locator {
    return this.page.getByTestId(`question-editor-input-${index}`);
  }

  get submitDisabledReasons(): Locator {
    return this.page.getByTestId("create-exam-submit-reasons");
  }

  get submitBtn(): Locator {
    return this.page.getByRole("button", { name: /출제하기|출제/i });
  }

  get successDialog(): Locator {
    return this.page.getByText(/출제 완료/i);
  }

  async goto() {
    await this.page.goto("/instructor/new");
  }

  async ensureManualQuestionsOpen() {
    if (
      !(await this.addQuestionBtn.first().isVisible().catch(() => false)) &&
      (await this.manualQuestionsToggle.isVisible().catch(() => false))
    ) {
      await this.manualQuestionsToggle.click();
    }
  }

  async addQuestion() {
    await this.ensureManualQuestionsOpen();
    await this.addQuestionBtn.first().click();
  }

  async fillQuestion(text: string, index = 0) {
    const editor = this.questionArea(index);
    if (!(await editor.isVisible().catch(() => false))) {
      await this.addQuestion();
    }
    await editor.click();
    await editor.fill(text);
  }
}
