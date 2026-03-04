import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures/auth-browser.fixture";

test.describe("Accessibility — WCAG 2.1 AA", () => {
  test("landing page has no critical a11y violations", async ({
    studentPage,
  }) => {
    await studentPage.goto("/");
    await studentPage.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page: studentPage })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      critical,
      `Critical a11y violations on /: ${critical.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);
  });

  test("student dashboard has no critical a11y violations", async ({
    studentPage,
  }) => {
    await studentPage.goto("/student");
    await studentPage.waitForLoadState("domcontentloaded");
    // Wait for some content to render
    await studentPage
      .locator("main, [role='main'], #__next")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const results = await new AxeBuilder({ page: studentPage })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      critical,
      `Critical a11y violations on /student: ${critical.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);
  });

  test("instructor dashboard has no critical a11y violations", async ({
    instructorPage,
  }) => {
    await instructorPage.goto("/instructor");
    await instructorPage.waitForLoadState("domcontentloaded");
    await instructorPage
      .locator("main, [role='main'], #__next")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const results = await new AxeBuilder({ page: instructorPage })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      critical,
      `Critical a11y violations on /instructor: ${critical.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);
  });
});
