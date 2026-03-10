import { type Page, type Locator } from "@playwright/test";

export class AdminDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userList: Locator;
  readonly userRows: Locator;
  readonly searchInput: Locator;
  readonly roleFilter: Locator;
  readonly stats: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /관리자|admin|대시보드|dashboard/i });
    this.userList = page.locator("[data-testid='user-list'], .user-list, table");
    this.userRows = page.locator("[data-testid='user-row'], .user-row, tbody tr");
    this.searchInput = page.getByPlaceholder(/검색|search/i);
    this.roleFilter = page.locator("[data-testid='role-filter'], select, [role='combobox']");
    this.stats = page.locator("[data-testid='stats'], .stats-card, .stats");
  }

  async goto() {
    await this.page.goto("/admin");
  }

  async getUserCount() {
    return this.userRows.count();
  }

  async searchUser(query: string) {
    await this.searchInput.fill(query);
  }
}
