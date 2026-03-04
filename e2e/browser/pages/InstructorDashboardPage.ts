import { type Page, type Locator } from "@playwright/test";

export class InstructorDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly examList: Locator;
  readonly createExamButton: Locator;
  readonly examCards: Locator;
  readonly examStatusBadges: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /강사|instructor|대시보드|dashboard/i });
    this.examList = page.locator("[data-testid='exam-list'], .exam-list, main");
    this.createExamButton = page.getByRole("link", { name: /시험 만들기|새 시험|create exam|new exam/i });
    this.examCards = page.locator("[data-testid='exam-card'], .exam-card, [role='article']");
    this.examStatusBadges = page.locator("[data-testid='exam-status'], .exam-status, [role='status']");
  }

  async goto() {
    await this.page.goto("/instructor");
  }

  async clickCreateExam() {
    await this.createExamButton.click();
  }

  async getExamCount() {
    return this.examCards.count();
  }
}
