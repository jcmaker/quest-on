import { type Page, type Locator } from "@playwright/test";

export class StudentDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly examList: Locator;
  readonly examCards: Locator;
  readonly noExamsMessage: Locator;
  readonly profileLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /대시보드|dashboard/i });
    this.examList = page.locator("[data-testid='exam-list'], .exam-list, main");
    this.examCards = page.locator("[data-testid='exam-card'], .exam-card, [role='article']");
    this.noExamsMessage = page.getByText(/시험이 없|no exam/i);
    this.profileLink = page.getByRole("link", { name: /프로필|profile/i });
  }

  async goto() {
    await this.page.goto("/student");
  }

  async getExamCount() {
    return this.examCards.count();
  }
}
