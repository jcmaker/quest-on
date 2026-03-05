import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

const supabase = getSupabaseServer();

export async function saveDraft(data: {
  sessionId: string;
  questionId: string;
  answer: string;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    const now = new Date().toISOString();

    // First, try to get existing submission for history tracking
    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id, answer, answer_history, edit_count, updated_at, created_at")
      .eq("session_id", data.sessionId)
      .eq("q_idx", data.questionId)
      .maybeSingle();

    if (existingSubmission) {
      // 답안이 변경된 경우에만 히스토리 업데이트
      const answerChanged = existingSubmission.answer !== data.answer;

      // 기존 히스토리 가져오기
      let answerHistory: Array<{ text: string; timestamp: string }> = [];
      if (existingSubmission.answer_history) {
        try {
          answerHistory = Array.isArray(existingSubmission.answer_history)
            ? existingSubmission.answer_history
            : [];
        } catch {
          answerHistory = [];
        }
      }

      // 답안이 변경된 경우 히스토리에 추가
      if (answerChanged && existingSubmission.answer) {
        answerHistory.push({
          text: existingSubmission.answer,
          timestamp:
            existingSubmission.updated_at || existingSubmission.created_at,
        });
      }

      // Update existing submission
      const { data: updatedSubmission, error: updateError } = await supabase
        .from("submissions")
        .update({
          answer: data.answer,
          updated_at: now,
          answer_history: answerHistory.length > 0 ? answerHistory : null,
          edit_count: answerChanged
            ? (existingSubmission.edit_count || 0) + 1
            : existingSubmission.edit_count || 0,
        })
        .eq("id", existingSubmission.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return successJson({ submission: updatedSubmission });
    } else {
      // Upsert new submission (race-safe: uses UNIQUE(session_id, q_idx) constraint)
      const { data: newSubmission, error: upsertError } = await supabase
        .from("submissions")
        .upsert(
          {
            session_id: data.sessionId,
            q_idx: data.questionId,
            answer: data.answer,
            created_at: now,
            updated_at: now,
            edit_count: 0,
            answer_history: [],
          },
          { onConflict: "session_id,q_idx" }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      return successJson({ submission: newSubmission });
    }
  } catch (error) {
    logError("[saveDraft] Failed to save draft", error, { path: "/api/supa/submission-handlers" });
    return errorJson("SAVE_DRAFT_FAILED", "Failed to save draft", 500);
  }
}

export async function saveAllDrafts(data: {
  sessionId: string;
  drafts: Array<{ questionId: string; text: string }>;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    const results = [];

    for (const draft of data.drafts) {
      if (draft.text.trim()) {
        const result = await saveDraft({
          sessionId: data.sessionId,
          questionId: draft.questionId,
          answer: draft.text,
        });

        if (result.status === 200) {
          const resultData = await result.json();
          results.push(resultData.submission);
        }
      }
    }

    return successJson({ submissions: results });
  } catch (error) {
    logError("[saveAllDrafts] Failed to save all drafts", error, { path: "/api/supa/submission-handlers" });
    return errorJson("SAVE_ALL_DRAFTS_FAILED", "Failed to save all drafts", 500);
  }
}

export async function saveDraftAnswers(data: {
  sessionId: string;
  answers: Array<{ questionId: string; text: string }>;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    // Fetch session and exam once outside the loop (avoid N+1 queries)
    const { data: session } = await supabase
      .from("sessions")
      .select("exam_id")
      .eq("id", data.sessionId)
      .single();

    if (!session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    const { data: exam } = await supabase
      .from("exams")
      .select("questions")
      .eq("id", session.exam_id)
      .single();

    if (!exam || !exam.questions) {
      return errorJson("EXAM_NOT_FOUND", "Exam or questions not found", 404);
    }

    const questions = exam.questions as Array<{ id: string }>;
    const results = [];

    for (const answer of data.answers) {
      if (answer.text.trim()) {
        const questionIndex = questions.findIndex(
          (q) => q.id === answer.questionId
        );

        if (questionIndex !== -1) {
          const result = await saveDraft({
            sessionId: data.sessionId,
            questionId: questionIndex.toString(),
            answer: answer.text,
          });

          if (result.status === 200) {
            const resultData = await result.json();
            results.push(resultData.submission);
          }
        }
      }
    }

    return successJson({ submissions: results });
  } catch (error) {
    logError("[saveDraftAnswers] Failed to save draft answers", error, { path: "/api/supa/submission-handlers" });
    return errorJson("SAVE_DRAFT_ANSWERS_FAILED", "Failed to save draft answers", 500);
  }
}

export async function getSessionSubmissions(data: { sessionId: string }) {
  try {
    // Verify session ownership (student or instructor who owns the exam)
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    // Allow access if user is the session owner (student) or the exam's instructor
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await supabase
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("id, q_idx, answer, compressed_answer_data, compression_metadata, created_at")
      .eq("session_id", data.sessionId)
      .order("q_idx", { ascending: true });

    if (error) throw error;

    return successJson({ submissions: submissions || [] });
  } catch (error) {
    logError("[getSessionSubmissions] Failed to get session submissions", error, { path: "/api/supa/submission-handlers" });
    return errorJson("GET_SUBMISSIONS_FAILED", "Failed to get session submissions", 500);
  }
}

export async function getSessionMessages(data: { sessionId: string }) {
  try {
    // Verify session ownership (student or instructor who owns the exam)
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await supabase
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, q_idx, role, content, compressed_content, compression_metadata, created_at")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return successJson({ messages: messages || [] });
  } catch (error) {
    logError("[getSessionMessages] Failed to get session messages", error, { path: "/api/supa/submission-handlers" });
    return errorJson("GET_MESSAGES_FAILED", "Failed to get session messages", 500);
  }
}
