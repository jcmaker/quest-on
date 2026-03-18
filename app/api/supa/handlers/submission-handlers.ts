import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

// Lazy Supabase client getter — creates a fresh client per invocation
// to avoid stale connections in serverless environments
function getSupabase() {
  return getSupabaseServer();
}

/** Maximum number of answer history entries to keep per submission */
const MAX_ANSWER_HISTORY = 50;

/** Trim answer history to MAX_ANSWER_HISTORY entries, removing oldest first */
function trimAnswerHistory(
  history: Array<{ text: string; timestamp: string }>
): Array<{ text: string; timestamp: string }> {
  if (history.length <= MAX_ANSWER_HISTORY) return history;
  return history.slice(history.length - MAX_ANSWER_HISTORY);
}

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
    const { data: sessionCheck } = await getSupabase()
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    // Validate questionId is a non-negative integer
    const qIdx = parseInt(data.questionId, 10);
    if (!Number.isFinite(qIdx) || qIdx < 0) {
      return errorJson("VALIDATION_ERROR", "Invalid question index", 400);
    }

    // Validate q_idx upper bound against exam questions
    const { data: examForValidation } = await getSupabase()
      .from("exams")
      .select("questions")
      .eq("id", sessionCheck.exam_id)
      .single();
    if (examForValidation?.questions && Array.isArray(examForValidation.questions)) {
      if (qIdx >= examForValidation.questions.length) {
        return errorJson("VALIDATION_ERROR", `Invalid question index: ${qIdx}`, 400);
      }
    }

    const now = new Date().toISOString();

    // First, try to get existing submission for history tracking
    const { data: existingSubmission } = await getSupabase()
      .from("submissions")
      .select("id, answer, answer_history, edit_count, updated_at, created_at")
      .eq("session_id", data.sessionId)
      .eq("q_idx", qIdx)
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
        answerHistory = trimAnswerHistory(answerHistory);
      }

      // Update existing submission with optimistic lock on edit_count to prevent lost increments
      const currentEditCount = existingSubmission.edit_count || 0;
      const newEditCount = answerChanged ? currentEditCount + 1 : currentEditCount;

      const { data: updatedSubmission, error: updateError } = await getSupabase()
        .from("submissions")
        .update({
          answer: data.answer,
          updated_at: now,
          answer_history: answerHistory.length > 0 ? answerHistory : null,
          edit_count: newEditCount,
        })
        .eq("id", existingSubmission.id)
        .eq("edit_count", currentEditCount) // optimistic lock: only update if edit_count hasn't changed
        .select()
        .single();

      if (updateError) {
        // Optimistic lock failure (concurrent edit) — retry once with fresh data
        const { data: freshSubmission } = await getSupabase()
          .from("submissions")
          .select("id, edit_count, answer, answer_history")
          .eq("id", existingSubmission.id)
          .single();

        if (freshSubmission) {
          // P1-1: Re-compute answer_history from fresh data to avoid losing concurrent edits
          let freshHistory: Array<{ text: string; timestamp: string }> = [];
          if (freshSubmission.answer_history) {
            try {
              freshHistory = Array.isArray(freshSubmission.answer_history)
                ? freshSubmission.answer_history
                : [];
            } catch {
              freshHistory = [];
            }
          }
          const freshAnswerChanged = freshSubmission.answer !== data.answer;
          if (freshAnswerChanged && freshSubmission.answer) {
            freshHistory.push({ text: freshSubmission.answer, timestamp: now });
            freshHistory = trimAnswerHistory(freshHistory);
          }

          const retryEditCount = freshAnswerChanged
            ? (freshSubmission.edit_count || 0) + 1
            : freshSubmission.edit_count || 0;

          const { data: retryResult, error: retryError } = await getSupabase()
            .from("submissions")
            .update({
              answer: data.answer,
              updated_at: now,
              answer_history: freshHistory.length > 0 ? freshHistory : null,
              edit_count: retryEditCount,
            })
            .eq("id", freshSubmission.id)
            .eq("edit_count", freshSubmission.edit_count) // P0-5: CAS guard on retry path
            .select()
            .single();

          if (retryError) {
            return errorJson("CONFLICT", "Concurrent edit conflict — please retry", 409);
          }
          return successJson({ submission: retryResult });
        }
        throw updateError;
      }
      return successJson({ submission: updatedSubmission });
    } else {
      // Upsert new submission (race-safe: uses UNIQUE(session_id, q_idx) constraint)
      const { data: newSubmission, error: upsertError } = await getSupabase()
        .from("submissions")
        .upsert(
          {
            session_id: data.sessionId,
            q_idx: qIdx,
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
    const { data: sessionCheck } = await getSupabase()
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    // Fetch exam for q_idx upper bound validation
    const { data: examForValidation } = await getSupabase()
      .from("exams")
      .select("questions")
      .eq("id", sessionCheck.exam_id)
      .single();
    if (!examForValidation?.questions || !Array.isArray(examForValidation.questions)) {
      return errorJson("EXAM_NOT_FOUND", "Exam questions not found for validation", 404);
    }
    const questionCount = examForValidation.questions.length;

    // Batch: fetch all existing submissions for this session in one query
    const { data: existingSubmissions } = await getSupabase()
      .from("submissions")
      .select("id, q_idx, answer, answer_history, edit_count, updated_at, created_at")
      .eq("session_id", data.sessionId);

    const existingByQIdx = new Map(
      (existingSubmissions || []).map((s) => [s.q_idx as number, s])
    );

    const now = new Date().toISOString();
    const insertPayloads: Array<Record<string, unknown>> = [];
    const updateTargets: Array<{
      id: string;
      currentEditCount: number;
      qIdx: number;
      payload: Record<string, unknown>;
    }> = [];
    const failedDrafts: Array<{ questionId: string; error: string }> = [];

    for (const draft of data.drafts) {
      if (!draft.text.trim()) continue;

      const qIdx = parseInt(draft.questionId, 10);
      if (!Number.isFinite(qIdx) || qIdx < 0 || qIdx >= questionCount) {
        failedDrafts.push({ questionId: draft.questionId, error: "Invalid question index" });
        continue;
      }

      const existing = existingByQIdx.get(qIdx);
      if (existing) {
        const answerChanged = existing.answer !== draft.text;
        if (!answerChanged) continue; // Skip unchanged — no write needed

        let answerHistory: Array<{ text: string; timestamp: string }> = Array.isArray(existing.answer_history) ? existing.answer_history : [];
        if (existing.answer) {
          answerHistory = trimAnswerHistory([...answerHistory, { text: existing.answer, timestamp: existing.updated_at || existing.created_at }]);
        }

        const currentEditCount = existing.edit_count || 0;
        updateTargets.push({
          id: existing.id,
          currentEditCount,
          qIdx,
          payload: {
            answer: draft.text,
            updated_at: now,
            answer_history: answerHistory.length > 0 ? answerHistory : null,
            edit_count: currentEditCount + 1,
          },
        });
      } else {
        insertPayloads.push({
          session_id: data.sessionId,
          q_idx: qIdx,
          answer: draft.text,
          created_at: now,
          updated_at: now,
          edit_count: 0,
          answer_history: [],
        });
      }
    }

    const results: unknown[] = [];

    // Phase 1: Batch insert new rows (race-safe via UNIQUE constraint)
    if (insertPayloads.length > 0) {
      const { data: insertedData, error: insertError } = await getSupabase()
        .from("submissions")
        .upsert(insertPayloads, { onConflict: "session_id,q_idx" })
        .select();

      if (insertError) throw insertError;
      results.push(...(insertedData || []));

      // P0-2: Post-insert verification — detect partial write failures
      if (insertedData && insertedData.length !== insertPayloads.length) {
        logError("[saveAllDrafts] Insert count mismatch — possible partial write", null, {
          path: "/api/supa/submission-handlers",
          additionalData: {
            sessionId: data.sessionId,
            expected: insertPayloads.length,
            actual: insertedData.length,
          },
        });
      }
    }

    // Phase 2: CAS-protected updates for changed existing rows
    // Uses edit_count guard to prevent overwriting concurrent saveDraft writes
    for (const target of updateTargets) {
      const { data: updated, error: updateError } = await getSupabase()
        .from("submissions")
        .update(target.payload)
        .eq("id", target.id)
        .eq("edit_count", target.currentEditCount)
        .select()
        .maybeSingle();

      if (updated) {
        results.push(updated);
      } else if (updateError) {
        failedDrafts.push({ questionId: String(target.qIdx), error: "Update failed" });
      }
      // CAS miss (updated===null, no error): concurrent saveDraft wrote newer data — skip silently
    }

    const totalAttempted = insertPayloads.length + updateTargets.length;
    if (failedDrafts.some(f => f.error === "Update failed")) {
      return successJson({
        submissions: results,
        warning: `${results.length}/${totalAttempted} drafts saved — some may need retry`,
        partialFailure: true,
        failedDrafts,
      }, 207);
    }

    return successJson({
      submissions: results,
      ...(failedDrafts.length > 0 && { failedDrafts, partialFailure: true }),
    });
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
    // 1. Auth + session ownership (1 query)
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await getSupabase()
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    // 2. Fetch exam questions for questionId→qIdx mapping (1 query)
    const { data: exam } = await getSupabase()
      .from("exams")
      .select("questions")
      .eq("id", sessionCheck.exam_id)
      .single();

    if (!exam || !exam.questions) {
      return errorJson("EXAM_NOT_FOUND", "Exam or questions not found", 404);
    }

    const questions = exam.questions as Array<{ id: string }>;
    const questionCount = questions.length;

    // 3. Fetch all existing submissions for this session (1 query)
    const { data: existingSubmissions } = await getSupabase()
      .from("submissions")
      .select("id, q_idx, answer, answer_history, edit_count, updated_at, created_at")
      .eq("session_id", data.sessionId);

    const existingByQIdx = new Map(
      (existingSubmissions || []).map((s) => [s.q_idx as number, s])
    );

    // 4. Build payloads — split into inserts (new) and CAS updates (existing changed)
    const now = new Date().toISOString();
    const insertPayloads: Array<Record<string, unknown>> = [];
    const updateTargets: Array<{
      id: string;
      currentEditCount: number;
      questionId: string;
      payload: Record<string, unknown>;
    }> = [];
    const failedDrafts: Array<{ questionId: string; error: string }> = [];

    for (const answer of data.answers) {
      if (!answer.text.trim()) continue;

      const qIdx = questions.findIndex((q) => q.id === answer.questionId);
      if (qIdx === -1 || qIdx >= questionCount) {
        failedDrafts.push({ questionId: answer.questionId, error: "Invalid question index" });
        continue;
      }

      const existing = existingByQIdx.get(qIdx);
      if (existing) {
        const answerChanged = existing.answer !== answer.text;
        if (!answerChanged) continue; // Skip unchanged — no write needed

        let answerHistory: Array<{ text: string; timestamp: string }> = Array.isArray(existing.answer_history) ? existing.answer_history : [];
        if (existing.answer) {
          answerHistory = trimAnswerHistory([...answerHistory, { text: existing.answer, timestamp: existing.updated_at || existing.created_at }]);
        }

        const currentEditCount = existing.edit_count || 0;
        updateTargets.push({
          id: existing.id,
          currentEditCount,
          questionId: answer.questionId,
          payload: {
            answer: answer.text,
            updated_at: now,
            answer_history: answerHistory.length > 0 ? answerHistory : null,
            edit_count: currentEditCount + 1,
          },
        });
      } else {
        insertPayloads.push({
          session_id: data.sessionId,
          q_idx: qIdx,
          answer: answer.text,
          created_at: now,
          updated_at: now,
          edit_count: 0,
          answer_history: [],
        });
      }
    }

    const results: unknown[] = [];

    // 5a. Batch insert new rows (race-safe via UNIQUE constraint)
    if (insertPayloads.length > 0) {
      const { data: insertedData, error: insertError } = await getSupabase()
        .from("submissions")
        .upsert(insertPayloads, { onConflict: "session_id,q_idx" })
        .select();

      if (insertError) throw insertError;
      results.push(...(insertedData || []));

      // P0-2: Post-insert verification — detect partial write failures
      if (insertedData && insertedData.length !== insertPayloads.length) {
        logError("[saveDraftAnswers] Insert count mismatch — possible partial write", null, {
          path: "/api/supa/submission-handlers",
          additionalData: {
            sessionId: data.sessionId,
            expected: insertPayloads.length,
            actual: insertedData.length,
          },
        });
      }
    }

    // 5b. CAS-protected updates for changed existing rows
    // Uses edit_count guard to prevent overwriting concurrent saveDraft writes
    for (const target of updateTargets) {
      const { data: updated, error: updateError } = await getSupabase()
        .from("submissions")
        .update(target.payload)
        .eq("id", target.id)
        .eq("edit_count", target.currentEditCount)
        .select()
        .maybeSingle();

      if (updated) {
        results.push(updated);
      } else if (updateError) {
        failedDrafts.push({ questionId: target.questionId, error: "Update failed" });
      }
      // CAS miss (updated===null, no error): concurrent saveDraft wrote newer data — skip silently
    }

    const totalAttempted = insertPayloads.length + updateTargets.length;
    if (failedDrafts.some(f => f.error === "Update failed")) {
      return successJson({
        submissions: results,
        warning: `${results.length}/${totalAttempted} answers saved — some may need retry`,
        partialFailure: true,
        failedDrafts,
      }, 207);
    }

    return successJson({
      submissions: results,
      ...(failedDrafts.length > 0 && { failedDrafts, partialFailure: true }),
    });
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
    const { data: sessionCheck } = await getSupabase()
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    // Allow access if user is the session owner (student) or the exam's instructor
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await getSupabase()
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: submissions, error } = await getSupabase()
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
    const { data: sessionCheck } = await getSupabase()
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await getSupabase()
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: messages, error } = await getSupabase()
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
