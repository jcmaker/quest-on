import { getSupabaseServer } from "@/lib/supabase-server";
import { errorJson } from "@/lib/api-response";
import type { AppUser } from "@/lib/get-current-user";

export type CaseGradeAccessContext = {
  supabase: ReturnType<typeof getSupabaseServer>;
  session: { id: string; exam_id: string };
  exam: {
    instructor_id: string;
    questions: unknown;
    language?: string | null;
  };
  user: AppUser;
};

/**
 * Instructor must own the exam (exam.instructor_id === user.id).
 */
export async function requireCaseGradeAccess(
  sessionId: string,
  user: AppUser | null,
  qIdx?: number,
): Promise<
  | { ok: true; ctx: CaseGradeAccessContext }
  | { ok: false; response: ReturnType<typeof errorJson> }
> {
  if (!user) {
    return { ok: false, response: errorJson("UNAUTHORIZED", "Unauthorized", 401) };
  }

  if (user.role !== "instructor") {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  const supabase = getSupabaseServer();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, exam_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return { ok: false, response: errorJson("NOT_FOUND", "Session not found", 404) };
  }

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("instructor_id, questions, language")
    .eq("id", session.exam_id)
    .single();

  if (examError || !exam) {
    return { ok: false, response: errorJson("NOT_FOUND", "Exam not found", 404) };
  }

  if (exam.instructor_id !== user.id) {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  if (qIdx !== undefined) {
    if (qIdx < 0) {
      return {
        ok: false,
        response: errorJson("VALIDATION_ERROR", `Invalid question index: ${qIdx}`, 400),
      };
    }
    if (Array.isArray(exam.questions) && qIdx >= exam.questions.length) {
      return {
        ok: false,
        response: errorJson(
          "VALIDATION_ERROR",
          `Invalid question index: ${qIdx} (exam has ${exam.questions.length} questions)`,
          400,
        ),
      };
    }
  }

  return {
    ok: true,
    ctx: { supabase, session, exam, user },
  };
}
