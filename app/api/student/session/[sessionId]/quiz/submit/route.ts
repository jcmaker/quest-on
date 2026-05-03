import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUUID } from "@/lib/validate-params";
import { submitQuizAttempt } from "@/lib/assignment-quiz";

const submitQuizSchema = z.object({
  answers: z.record(z.number().int().min(0).max(3)),
});

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
    default:
      return errorJson(error, "Failed to submit quiz", 500);
  }
}

export async function POST(
  request: NextRequest,
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

  const rl = await checkRateLimitAsync(`assignment-quiz-submit:${userId}`, RATE_LIMITS.submission);
  if (!rl.allowed) {
    return errorJson("RATE_LIMITED", "Too many requests", 429);
  }

  const body = await request.json().catch(() => null);
  const parsed = submitQuizSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson("VALIDATION_ERROR", "Invalid quiz answers", 400);
  }

  const result = await submitQuizAttempt({
    sessionId,
    userId,
    answers: parsed.data.answers,
  });

  if (!("quiz" in result)) {
    return mapQuizError(result.error);
  }

  return successJson(result);
}
