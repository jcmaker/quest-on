import { type Page, type Locator } from "@playwright/test";

export class StudentReportPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly scoreDisplay: Locator;
  readonly feedbackSection: Locator;
  readonly questionCards: Locator;
  readonly overallScore: Locator;
  readonly downloadButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /리포트|report|결과/i });
    this.scoreDisplay = page.locator("[data-testid='score-display'], .score-display");
    this.feedbackSection = page.locator("[data-testid='feedback-section'], .feedback-section");
    this.questionCards = page.locator("[data-testid='question-card'], .question-card");
    this.overallScore = page.getByTestId("report-overall-score");
    // PDF download button may be hidden per project MEMORY.md (temporarily hidden feature)
    this.downloadButton = page.getByRole("button", { name: /다운로드|download|PDF/i });
  }

  async goto(sessionId: string) {
    await this.page.goto(`/student/report/${sessionId}`);
  }

  async getScore(): Promise<string | null> {
    return this.scoreDisplay.textContent();
  }
}
