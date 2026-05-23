import { getSupabaseServer } from "@/lib/supabase-server";
import { errorJson } from "@/lib/api-response";
import type { AppUser } from "@/lib/get-current-user";

export type BulkGradeAccessContext = {
  supabase: ReturnType<typeof getSupabaseServer>;
  exam: {
    id: string;
    instructor_id: string;
    title: string;
    description: string | null;
    questions: unknown;
    language: string;
  };
  user: AppUser;
};

/**
 * Exam-level access check for bulk grading.
 * Instructor must own the exam (exam.instructor_id === user.id).
 */
export async function requireBulkGradeAccess(
  examId: string,
  user: AppUser | null,
): Promise<
  | { ok: true; ctx: BulkGradeAccessContext }
  | { ok: false; response: ReturnType<typeof errorJson> }
> {
  if (!user) {
    return { ok: false, response: errorJson("UNAUTHORIZED", "Unauthorized", 401) };
  }

  if (user.role !== "instructor") {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  const supabase = getSupabaseServer();

  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, instructor_id, title, description, questions, language")
    .eq("id", examId)
    .single();

  if (examError || !exam) {
    return { ok: false, response: errorJson("NOT_FOUND", "Exam not found", 404) };
  }

  if (exam.instructor_id !== user.id) {
    return { ok: false, response: errorJson("FORBIDDEN", "Forbidden", 403) };
  }

  return {
    ok: true,
    ctx: {
      supabase,
      exam: {
        id: exam.id as string,
        instructor_id: exam.instructor_id as string,
        title: exam.title as string,
        description: (exam.description as string | null) ?? null,
        questions: exam.questions,
        language: (exam.language as string) ?? "ko",
      },
      user,
    },
  };
}
