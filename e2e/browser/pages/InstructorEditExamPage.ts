import { Page, Locator } from "@playwright/test";

export class InstructorEditExamPage {
  constructor(private page: Page) {}

  get titleInput(): Locator {
    return this.page.getByLabel("시험 제목");
  }

  get submitBtn(): Locator {
    return this.page.getByRole("button", { name: /수정하기|저장|수정 완료/i });
  }

  get cancelBtn(): Locator {
    return this.page.getByRole("button", { name: /취소|돌아가기/i });
  }

  get cancelLink(): Locator {
    return this.page.getByRole("link", { name: /취소|돌아가기/i });
  }

  async goto(examId: string) {
    await this.page.goto(`/instructor/${examId}/edit`);
  }
}
