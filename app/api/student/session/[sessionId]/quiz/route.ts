import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUUID } from "@/lib/validate-params";
import { ensureQuizAttempt } from "@/lib/assignment-quiz";

function mapQuizError(error: string) {
  switch (error) {
    case "SESSION_NOT_FOUND":
    case "EXAM_NOT_FOUND":
    case "QUIZ_NOT_FOUND":
      return errorJson(error, "Quiz not found", 404);
    case "FORBIDDEN":
      return errorJson("FORBIDDEN", "Forbidden", 403);
    case "NOT_ASSIGNMENT":
      return errorJson("NOT_ASSIGNMENT", "This session is not an assignment", 400);
    case "FINAL_ANSWER_REQUIRED":
      return errorJson(
        "FINAL_ANSWER_REQUIRED",
        "Final answer is required before quiz",
        400,
        { reason: "final_answer_missing" }
      );
    default:
      return errorJson(error, "Failed to load quiz", 500);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const invalidId = validateUUID(sessionId, "sessionId");
  if (invalidId) return invalidId;

  const user = await currentUser();
  if (!user?.id) {
    return errorJson("UNAUTHORIZED", "Unauthorized", 401);
  }
  const userId = user.id;
  if (user.role !== "student") {
    return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
  }

  const rl = await checkRateLimitAsync(`assignment-quiz:${userId}`, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return errorJson("RATE_LIMITED", "Too many requests", 429);
  }

  const result = await ensureQuizAttempt(sessionId, userId);
  if (!("quiz" in result)) {
    return mapQuizError(result.error);
  }

  return successJson({
    quiz: result.quiz,
    exam: {
      id: result.exam.id,
      title: result.exam.title,
      code: result.exam.code,
    },
  });
}
