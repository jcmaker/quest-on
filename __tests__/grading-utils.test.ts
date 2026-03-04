import { describe, it, expect } from "vitest";
import {
  getScoreColor,
  getScoreColorRelative,
  getStatusColor,
  formatDateKo,
  isAiGraded,
} from "@/lib/grading-utils";

describe("getScoreColor", () => {
  it("returns green for score >= 90", () => {
    expect(getScoreColor(90)).toContain("green");
    expect(getScoreColor(100)).toContain("green");
  });

  it("returns blue for score 80-89", () => {
    expect(getScoreColor(80)).toContain("blue");
    expect(getScoreColor(89)).toContain("blue");
  });

  it("returns yellow for score 70-79", () => {
    expect(getScoreColor(70)).toContain("yellow");
    expect(getScoreColor(79)).toContain("yellow");
  });

  it("returns red for score < 70", () => {
    expect(getScoreColor(69)).toContain("red");
    expect(getScoreColor(0)).toContain("red");
  });
});

describe("getScoreColorRelative", () => {
  it("returns muted for null score", () => {
    expect(getScoreColorRelative(null, 100)).toContain("muted");
  });

  it("returns muted for null maxScore", () => {
    expect(getScoreColorRelative(85, null)).toContain("muted");
  });

  it("calculates percentage and returns correct color", () => {
    // 90/100 = 90% → green
    expect(getScoreColorRelative(90, 100)).toContain("green");
    // 45/50 = 90% → green
    expect(getScoreColorRelative(45, 50)).toContain("green");
    // 35/50 = 70% → yellow
    expect(getScoreColorRelative(35, 50)).toContain("yellow");
  });
});

describe("getStatusColor", () => {
  it("returns green for completed", () => {
    expect(getStatusColor("completed")).toContain("green");
  });

  it("returns blue for in-progress", () => {
    expect(getStatusColor("in-progress")).toContain("blue");
  });

  it("returns muted for unknown status", () => {
    expect(getStatusColor("unknown")).toContain("muted");
  });
});

describe("formatDateKo", () => {
  it("returns '날짜 없음' for null", () => {
    expect(formatDateKo(null)).toBe("날짜 없음");
  });

  it("formats a valid date string", () => {
    const result = formatDateKo("2024-01-15T10:30:00Z");
    // Should contain year and month in Korean format
    expect(result).toContain("2024");
  });
});

describe("isAiGraded", () => {
  it("returns true for grade_type auto", () => {
    expect(isAiGraded({ grade_type: "auto" })).toBe(true);
  });

  it("returns false for grade_type manual", () => {
    expect(isAiGraded({ grade_type: "manual" })).toBe(false);
  });

  it("falls back to comment pattern for legacy rows", () => {
    expect(isAiGraded({ comment: "채팅 단계: 잘했습니다" })).toBe(true);
    expect(isAiGraded({ comment: "답안 단계 평가" })).toBe(true);
    expect(isAiGraded({ comment: "피드백 단계 분석" })).toBe(true);
  });

  it("returns false for regular comment without pattern", () => {
    expect(isAiGraded({ comment: "Good work" })).toBe(false);
  });

  it("returns false for null comment without grade_type", () => {
    expect(isAiGraded({ comment: null })).toBe(false);
  });
});
