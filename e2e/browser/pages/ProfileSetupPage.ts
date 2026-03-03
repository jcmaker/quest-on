import { Page, Locator } from "@playwright/test";

export class ProfileSetupPage {
  constructor(private page: Page) {}

  get nameInput(): Locator {
    return this.page.getByLabel("이름");
  }

  get studentNumberInput(): Locator {
    return this.page.getByLabel("학번");
  }

  get schoolInput(): Locator {
    return this.page.getByLabel("학교");
  }

  get submitBtn(): Locator {
    return this.page.getByRole("button", { name: /저장|완료|시작|설정 완료|프로필/i });
  }

  async goto() {
    await this.page.goto("/student/profile-setup");
  }

  async fillProfile(name: string, studentNum: string, school: string) {
    await this.nameInput.fill(name);
    await this.studentNumberInput.fill(studentNum);
    await this.schoolInput.fill(school);
  }
}
