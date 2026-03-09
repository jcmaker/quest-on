import { Page, Locator } from "@playwright/test";

export class OnboardingPage {
  constructor(private page: Page) {}

  get welcomeHeading(): Locator {
    return this.page.getByText(/환영합니다/i);
  }

  get studentRadio(): Locator {
    return this.page.locator('button[role="radio"][value="student"]');
  }

  get instructorRadio(): Locator {
    return this.page.locator('button[role="radio"][value="instructor"]');
  }

  get instructorLabel(): Locator {
    return this.page.getByText(/강사|시험 출제자/i);
  }

  async goto() {
    await this.page.goto("/onboarding");
  }
}
