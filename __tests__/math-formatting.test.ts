import { describe, expect, it } from "vitest";
import {
  containsMathSyntax,
  normalizeMathDelimiters,
  renderMathInHtml,
} from "@/lib/math-formatting";

describe("normalizeMathDelimiters", () => {
  it("converts slash-style delimiters to dollar delimiters", () => {
    const result = normalizeMathDelimiters(
      "식은 \\(x^2 + y^2\\) 이고 적분은 \\[\\int_0^1 x dx\\] 입니다."
    );

    expect(result).toContain("$x^2 + y^2$");
    expect(result).toContain("$$\\int_0^1 x dx$$");
  });
});

describe("containsMathSyntax", () => {
  it("detects latex delimiters", () => {
    expect(containsMathSyntax("여기 \\(x^2\\) 가 있습니다.")).toBe(true);
    expect(containsMathSyntax("여기 $x^2$ 가 있습니다.")).toBe(true);
    expect(containsMathSyntax("일반 문장입니다.")).toBe(false);
  });
});

describe("renderMathInHtml", () => {
  it("renders inline and block math to katex html", () => {
    const result = renderMathInHtml(
      "<p>인라인 \\(x^2\\) 와 블록 \\[\\int_0^1 x dx\\]</p>"
    );

    expect(result).toContain('class="katex"');
    expect(result).toContain('class="qa-math-block');
  });
});
