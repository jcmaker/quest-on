import { describe, expect, it } from "vitest";
import {
  isSessionConfirmedSubmitted,
  sanitizeSubmissionErrorMessage,
} from "@/lib/exam-submission";

describe("isSessionConfirmedSubmitted", () => {
  it("treats completed sessions from /api/student/sessions as submitted", () => {
    expect(
      isSessionConfirmedSubmitted({
        status: "completed",
        submittedAt: "2026-03-13T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("treats auto_submitted sessions as submitted even without status remapping", () => {
    expect(
      isSessionConfirmedSubmitted({
        status: "auto_submitted",
        submitted_at: "2026-03-13T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("does not mark in-progress sessions as submitted", () => {
    expect(
      isSessionConfirmedSubmitted({
        status: "in-progress",
        submittedAt: null,
      })
    ).toBe(false);
  });
});

describe("sanitizeSubmissionErrorMessage", () => {
  it("replaces raw html error pages with a generic server message", () => {
    expect(
      sanitizeSubmissionErrorMessage("<!DOCTYPE html><html><body>500</body></html>", {
        status: 500,
        contentType: "text/html; charset=utf-8",
      })
    ).toBe("일시적인 서버 오류가 발생했습니다. 제출 상태를 다시 확인해주세요.");
  });

  it("preserves short plain-text api messages", () => {
    expect(
      sanitizeSubmissionErrorMessage("시험 시간이 종료되었습니다.", {
        status: 400,
        contentType: "text/plain; charset=utf-8",
      })
    ).toBe("시험 시간이 종료되었습니다.");
  });
});
