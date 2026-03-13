type SessionSubmissionLike = {
  status?: string | null;
  submittedAt?: string | null;
  submitted_at?: string | null;
  autoSubmitted?: boolean | null;
  auto_submitted?: boolean | null;
};

const CONFIRMED_SUBMISSION_STATUSES = new Set([
  "submitted",
  "graded",
  "completed",
  "auto_submitted",
]);

const DEFAULT_SUBMISSION_ERROR_MESSAGE = "답안 제출에 실패했습니다.";
const DEFAULT_SERVER_SUBMISSION_ERROR_MESSAGE =
  "일시적인 서버 오류가 발생했습니다. 제출 상태를 다시 확인해주세요.";

export function isSessionConfirmedSubmitted(
  session: SessionSubmissionLike | null | undefined
): boolean {
  if (!session) return false;

  const status = session.status?.toLowerCase();
  return Boolean(
    session.submittedAt ||
      session.submitted_at ||
      session.autoSubmitted ||
      session.auto_submitted ||
      (status && CONFIRMED_SUBMISSION_STATUSES.has(status))
  );
}

export function sanitizeSubmissionErrorMessage(
  message: string | null | undefined,
  options: {
    status?: number;
    contentType?: string | null;
  } = {}
): string {
  const trimmed = message?.trim() || "";
  const isHtml =
    options.contentType?.includes("text/html") ||
    /^<!doctype html/i.test(trimmed) ||
    /^<html/i.test(trimmed);

  if (!trimmed || isHtml) {
    return options.status && options.status >= 500
      ? DEFAULT_SERVER_SUBMISSION_ERROR_MESSAGE
      : DEFAULT_SUBMISSION_ERROR_MESSAGE;
  }

  if (trimmed.length > 500) {
    return `${trimmed.slice(0, 497)}...`;
  }

  return trimmed;
}
