import { Page, Locator } from "@playwright/test";

export class StudentJoinPage {
  constructor(private page: Page) {}

  get otpInput(): Locator {
    return this.page.locator("[data-input-otp]");
  }

  get submitBtn(): Locator {
    return this.page.getByRole("button", { name: /시험 입장|입장/i });
  }

  get instructionsDialog(): Locator {
    return this.page.getByText(/학생 지침/i);
  }

  get confirmBtn(): Locator {
    return this.page.getByRole("button", { name: /확인.*시험 시작|시작/i });
  }

  async goto() {
    await this.page.goto("/join");
  }

  async enterCode(code: string) {
    await this.otpInput.click();
    await this.page.keyboard.type(code);
  }
}
