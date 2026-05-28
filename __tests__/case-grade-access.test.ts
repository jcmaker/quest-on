import { describe, expect, it } from "vitest";
import {
  hasQuestionWithQIdx,
  questionPromptByQIdx,
} from "@/lib/case-grade-access";

describe("case-grade qIdx helpers", () => {
  const questions = [
    { id: "a", idx: 10, type: "essay", text: "First explicit case" },
    { id: "b", idx: 20, type: "essay", prompt: "Second explicit case" },
  ];

  it("resolves explicit question idx instead of array offsets", () => {
    expect(hasQuestionWithQIdx(questions, 20)).toBe(true);
    expect(questionPromptByQIdx(questions, 20)).toBe("Second explicit case");
  });

  it("rejects missing explicit qIdx values", () => {
    expect(hasQuestionWithQIdx(questions, 1)).toBe(false);
    expect(questionPromptByQIdx(questions, 1)).toBe("");
  });
});
