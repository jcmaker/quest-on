import { describe, it, expect } from "vitest";
import { sanitizeUserInput } from "@/lib/sanitize";

describe("sanitizeUserInput", () => {
  it("returns plain text unchanged", () => {
    expect(sanitizeUserInput("Hello, world!")).toBe("Hello, world!");
  });

  it("removes null bytes", () => {
    expect(sanitizeUserInput("hello\u0000world")).toBe("helloworld");
  });

  it("strips <script> tags with content", () => {
    expect(sanitizeUserInput('<script>alert("xss")</script>')).toBe("");
  });

  it("strips <script> tags case-insensitive", () => {
    expect(sanitizeUserInput("<SCRIPT>alert(1)</SCRIPT>")).toBe("");
  });

  it("removes onclick event handler", () => {
    const result = sanitizeUserInput('<div onclick="alert(1)">test</div>');
    expect(result).toBe("<div>test</div>");
  });

  it("removes onerror event handler", () => {
    const result = sanitizeUserInput('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
  });

  it("strips javascript: URI from href", () => {
    const result = sanitizeUserInput(
      '<a href="javascript:alert(1)">click</a>'
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("removes dangerous tags like iframe", () => {
    expect(
      sanitizeUserInput('<iframe src="evil.com"></iframe>')
    ).toBe("");
  });

  it("strips IE CSS expression from style attribute", () => {
    const result = sanitizeUserInput(
      '<div style="width: expression(alert(1))">test</div>'
    );
    expect(result).not.toContain("expression");
    expect(result).toContain("test");
  });

  it("preserves safe HTML", () => {
    const safe = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeUserInput(safe)).toBe(safe);
  });

  it("handles unicode content unchanged", () => {
    const unicode = "안녕하세요 テスト";
    expect(sanitizeUserInput(unicode)).toBe(unicode);
  });
});
