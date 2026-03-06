import { describe, it, expect } from "vitest";
import {
  selectBestSubmission,
  decompressSubmissions,
  decompressMessages,
  normalizeQuestions,
  buildRubricText,
  calculateWeightedScore,
  analyzeAiDependency,
  summarizeAiDependencyAssessments,
} from "@/lib/grading-helpers";

describe("selectBestSubmission", () => {
  it("prefers the longer answer", () => {
    const subs = [
      { answer: "short", created_at: "2024-01-01T00:00:00Z" },
      { answer: "a longer answer here", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("a longer answer here");
  });

  it("prefers the most recent when answers are equal length", () => {
    const subs = [
      { answer: "same", created_at: "2024-01-01T00:00:00Z" },
      { answer: "same", created_at: "2024-06-15T12:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.created_at).toBe("2024-06-15T12:00:00Z");
  });

  it("returns the only submission when there is one", () => {
    const subs = [{ answer: "only one", created_at: "2024-01-01T00:00:00Z" }];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("only one");
  });

  it("handles empty answer strings", () => {
    const subs = [
      { answer: "", created_at: "2024-06-15T12:00:00Z" },
      { answer: "", created_at: "2024-01-01T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    // Both empty, should pick the more recent one
    expect(best.created_at).toBe("2024-06-15T12:00:00Z");
  });

  it("handles null/undefined answer", () => {
    const subs = [
      { answer: null, created_at: "2024-01-01T00:00:00Z" },
      { answer: "has answer", created_at: "2024-01-02T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("has answer");
  });

  it("prefers submitted over draft even if draft has longer answer", () => {
    const subs = [
      { answer: "a very long draft auto-saved answer", created_at: "2024-01-01T00:00:00Z", submitted_at: null },
      { answer: "short final", created_at: "2024-01-02T00:00:00Z", submitted_at: "2024-01-02T00:01:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("short final");
  });

  it("prefers most recent submission when both are submitted", () => {
    const subs = [
      { answer: "first submit", created_at: "2024-01-01T00:00:00Z", submitted_at: "2024-01-01T00:01:00Z" },
      { answer: "second submit", created_at: "2024-01-02T00:00:00Z", submitted_at: "2024-01-02T00:01:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("second submit");
  });

  it("prefers most recent draft when neither is submitted", () => {
    const subs = [
      { answer: "old draft with more text", created_at: "2024-01-01T00:00:00Z" },
      { answer: "new draft", created_at: "2024-01-02T00:00:00Z" },
    ];
    const best = selectBestSubmission(subs);
    expect(best.answer).toBe("new draft");
  });

  it("handles auto-submit race: auto-submit empty vs manual submit", () => {
    const subs = [
      { answer: "", created_at: "2024-01-01T00:00:00Z", submitted_at: "2024-01-01T00:30:00Z" },
      { answer: "my real answer", created_at: "2024-01-01T00:01:00Z", submitted_at: "2024-01-01T00:30:05Z" },
    ];
    const best = selectBestSubmission(subs);
    // Both submitted — should pick the more recent one
    expect(best.answer).toBe("my real answer");
  });
});

describe("decompressSubmissions", () => {
  it("groups by q_idx and picks best", () => {
    const submissions = [
      { q_idx: 0, answer: "short", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 0, answer: "longer answer", created_at: "2024-01-02T00:00:00Z" },
      { q_idx: 1, answer: "q1 answer", created_at: "2024-01-01T00:00:00Z" },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[0].answer).toBe("longer answer");
    expect(result[1].answer).toBe("q1 answer");
  });

  it("returns empty object for empty array", () => {
    expect(decompressSubmissions([])).toEqual({});
  });

  it("returns empty object for null/undefined", () => {
    expect(decompressSubmissions(null as unknown as Array<Record<string, unknown>>)).toEqual({});
  });

  it("handles duplicate q_idx entries — picks most recent", () => {
    const submissions = [
      { q_idx: 2, answer: "first", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 2, answer: "second longer", created_at: "2024-01-02T00:00:00Z" },
      { q_idx: 2, answer: "third", created_at: "2024-01-03T00:00:00Z" },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[2].answer).toBe("third");
  });

  it("falls back to raw answer when decompression fails", () => {
    const submissions = [
      {
        q_idx: 0,
        answer: "raw fallback",
        compressed_answer_data: "invalid_compressed_data",
        created_at: "2024-01-01T00:00:00Z",
      },
    ];
    const result = decompressSubmissions(submissions);
    expect(result[0].answer).toBe("raw fallback");
  });
});

describe("decompressMessages", () => {
  it("groups messages by q_idx", () => {
    const messages = [
      { q_idx: 0, role: "user", content: "hello", created_at: "2024-01-01T00:00:00Z" },
      { q_idx: 0, role: "assistant", content: "hi", created_at: "2024-01-01T00:01:00Z" },
      { q_idx: 1, role: "user", content: "q1", created_at: "2024-01-01T00:02:00Z" },
    ];
    const result = decompressMessages(messages);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(1);
    expect(result[0][0].content).toBe("hello");
  });

  it("returns empty object for empty array", () => {
    expect(decompressMessages([])).toEqual({});
  });

  it("returns empty object for null/undefined", () => {
    expect(decompressMessages(null as unknown as Array<Record<string, unknown>>)).toEqual({});
  });

  it("falls back to raw content when decompression fails", () => {
    const messages = [
      {
        q_idx: 0,
        role: "user",
        content: "fallback content",
        compressed_content: "invalid_data",
      },
    ];
    const result = decompressMessages(messages);
    expect(result[0][0].content).toBe("fallback content");
  });
});

describe("normalizeQuestions", () => {
  it("maps text to prompt when prompt is missing", () => {
    const questions = [{ text: "What is 2+2?", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].prompt).toBe("What is 2+2?");
    expect(result[0].idx).toBe(0);
  });

  it("prefers prompt over text", () => {
    const questions = [{ text: "text field", prompt: "prompt field", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].prompt).toBe("prompt field");
  });

  it("uses array index when idx is not present", () => {
    const questions = [{ text: "first" }, { text: "second" }];
    const result = normalizeQuestions(questions);
    expect(result[0].idx).toBe(0);
    expect(result[1].idx).toBe(1);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions(undefined)).toEqual([]);
    expect(normalizeQuestions("string")).toEqual([]);
  });

  it("preserves ai_context", () => {
    const questions = [{ text: "q", ai_context: "context info", idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].ai_context).toBe("context info");
  });

  it("sets ai_context to undefined for non-string values", () => {
    const questions = [{ text: "q", ai_context: 123, idx: 0 }];
    const result = normalizeQuestions(questions);
    expect(result[0].ai_context).toBeUndefined();
  });
});

describe("buildRubricText", () => {
  it("formats rubric items correctly", () => {
    const rubric = [
      { evaluationArea: "논리성", detailedCriteria: "논리적 구조가 명확한가" },
      { evaluationArea: "정확성", detailedCriteria: "사실관계가 정확한가" },
    ];
    const result = buildRubricText(rubric);
    expect(result).toContain("평가 루브릭 기준");
    expect(result).toContain("1. 논리성");
    expect(result).toContain("세부 기준: 논리적 구조가 명확한가");
    expect(result).toContain("2. 정확성");
    expect(result).toContain("세부 기준: 사실관계가 정확한가");
  });

  it("returns empty string for empty rubric", () => {
    expect(buildRubricText([])).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(buildRubricText(null)).toBe("");
    expect(buildRubricText(undefined)).toBe("");
  });

  it("includes evaluationArea and detailedCriteria", () => {
    const rubric = [
      { evaluationArea: "Area1", detailedCriteria: "Criteria1" },
    ];
    const result = buildRubricText(rubric);
    expect(result).toContain("Area1");
    expect(result).toContain("Criteria1");
  });
});

describe("analyzeAiDependency", () => {
  it("detects delegation and starting-point dependency without recovery", () => {
    const assessment = analyzeAiDependency({
      messages: [
        { role: "user", content: "이 문제 어떻게 풀어?" },
        { role: "assistant", content: "먼저 조건을 정리한 뒤 에너지 보존을 적용하세요." },
        { role: "user", content: "정답만 알려줘." },
        { role: "assistant", content: "정답은 42입니다." },
      ],
      finalAnswer: "정답은 42이다.",
    });

    expect(assessment.delegationRequestCount).toBeGreaterThan(0);
    expect(assessment.directAnswerRequestCount).toBeGreaterThan(0);
    expect(assessment.recoveryObserved).toBe(false);
    expect(assessment.overallRisk).toBe("high");
    expect(assessment.penaltyApplied).toBeGreaterThan(0);
  });

  it("recognizes independent-reasoning recovery after AI help", () => {
    const assessment = analyzeAiDependency({
      messages: [
        { role: "user", content: "어떤 개념을 써야 해?" },
        { role: "assistant", content: "등온 과정이므로 내부에너지 변화는 0입니다." },
        {
          role: "user",
          content:
            "그러면 제 생각에는 먼저 등온 과정이라서 ΔU=0을 두고, 주어진 조건을 보면 Q=W 관계로 정리할 수 있습니다.",
        },
      ],
      finalAnswer:
        "등온 과정이라 내부에너지 변화는 0이고, 따라서 공급된 열량과 한 일의 크기가 같습니다.",
    });

    expect(assessment.startingPointDependencyCount).toBeGreaterThan(0);
    expect(assessment.recoveryObserved).toBe(true);
    expect(assessment.recoveryEvidence.length).toBeGreaterThan(0);
    expect(["low", "medium"]).toContain(assessment.overallRisk);
  });
});

describe("summarizeAiDependencyAssessments", () => {
  it("aggregates per-question dependency signals", () => {
    const summary = summarizeAiDependencyAssessments([
      {
        q_idx: 0,
        assessment: analyzeAiDependency({
          messages: [
            { role: "user", content: "정답만 알려줘." },
            { role: "assistant", content: "정답은 42입니다." },
          ],
          finalAnswer: "정답은 42이다.",
        }),
      },
      {
        q_idx: 1,
        assessment: analyzeAiDependency({
          messages: [
            { role: "user", content: "어떤 개념을 써야 해?" },
            { role: "assistant", content: "등온 과정입니다." },
            {
              role: "user",
              content: "정리하면 등온이므로 ΔU=0이고, 그래서 Q와 W를 비교하면 됩니다.",
            },
          ],
          finalAnswer: "등온 과정이라 ΔU=0이다.",
        }),
      },
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.triggerCount).toBeGreaterThan(0);
    expect(summary?.questionBreakdown).toHaveLength(2);
  });
});

describe("calculateWeightedScore", () => {
  it("calculates 50/50 weighted average by default", () => {
    const result = calculateWeightedScore({
      chat: { score: 80 },
      answer: { score: 60 },
    });
    expect(result).toBe(70); // (80*0.5 + 60*0.5)
  });

  it("applies custom weight", () => {
    const result = calculateWeightedScore(
      { chat: { score: 100 }, answer: { score: 0 } },
      30
    );
    expect(result).toBe(30); // (100*0.3 + 0*0.7)
  });

  it("uses chat score alone when answer is missing", () => {
    const result = calculateWeightedScore({ chat: { score: 85 } });
    expect(result).toBe(85);
  });

  it("uses answer score alone when chat is missing", () => {
    const result = calculateWeightedScore({ answer: { score: 72 } });
    expect(result).toBe(72);
  });

  it("returns 0 when both stages are missing", () => {
    const result = calculateWeightedScore({});
    expect(result).toBe(0);
  });

  it("clamps score to 0-100 range", () => {
    expect(
      calculateWeightedScore({
        chat: { score: 150 },
        answer: { score: 150 },
      })
    ).toBe(100);

    expect(
      calculateWeightedScore({
        chat: { score: -50 },
        answer: { score: -50 },
      })
    ).toBe(0);
  });
});
