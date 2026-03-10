import { Page, Locator } from "@playwright/test";

export class AdminLoginPage {
  constructor(private page: Page) {}

  get usernameInput(): Locator {
    return this.page.getByLabel(/사용자명/i);
  }

  get passwordInput(): Locator {
    return this.page.getByLabel(/비밀번호/i);
  }

  get submitBtn(): Locator {
    return this.page.locator("form").getByRole("button", { name: /로그인/i });
  }

  get errorMessage(): Locator {
    return this.page.getByText(/실패|error|invalid|잘못|unauthorized|credentials/i);
  }

  async goto() {
    await this.page.goto("/admin/login");
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
  }
}
