import { Page, Locator } from "@playwright/test";

export class InstructorGradePage {
  constructor(private page: Page) {}

  get scoreInput(): Locator {
    return this.page.locator('[data-testid="grade-score-input"]');
  }

  get saveBtn(): Locator {
    return this.page.locator('[data-testid="grade-save-btn"]');
  }

  questionNavButton(idx: number): Locator {
    return this.page.locator(`[data-testid="question-nav-${idx}"]`);
  }

  async goto(examId: string, sessionId: string) {
    await this.page.goto(`/instructor/${examId}/grade/${sessionId}`);
  }

  async setScore(score: string) {
    await this.scoreInput.fill(score);
  }
}
