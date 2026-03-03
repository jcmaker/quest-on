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

  get questionArea(): Locator {
    return this.page.locator('textarea, [contenteditable="true"]').first();
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

  async fillQuestion(text: string) {
    await this.questionArea.click();
    const tagName = await this.questionArea.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === "textarea") {
      await this.questionArea.fill(text);
    } else {
      await this.page.keyboard.type(text);
    }
  }
}
