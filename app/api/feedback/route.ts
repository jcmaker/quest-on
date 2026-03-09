export const maxDuration = 300;

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { compressData } from "@/lib/compression";
import { enqueueGrading } from "@/lib/openai";
import { autoGradeSession } from "@/lib/grading";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Lazy Supabase getter — avoids stale module-level singleton in serverless
function getSupabase() {
  return getSupabaseServer();
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const {
      examCode,
      answers,
      examId: requestedExamId,
      sessionId,
      chatHistory,
      studentId,
    } =
      await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return errorJson("BAD_REQUEST", "Missing required fields", 400);
    }

    if (studentId && studentId !== user.id) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    const verifiedStudentId = user.id;

    // Rate limit: submission triggers expensive auto-grading
    const rl = await checkRateLimitAsync(`submission:${user.id}`, RATE_LIMITS.submission);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many submissions. Please wait.", 429);
    }

    // Validate answer count and individual answer length
    const MAX_ANSWERS = 50;
    const MAX_ANSWER_LENGTH = 100_000;
    if (answers.length > MAX_ANSWERS) {
      return errorJson("BAD_REQUEST", "Too many answers", 400);
    }
    for (const a of answers) {
      const text = typeof a === "string" ? a : (a as Record<string, unknown>)?.text || "";
      if (typeof text === "string" && text.length > MAX_ANSWER_LENGTH) {
        return errorJson("BAD_REQUEST", "Answer too long", 400);
      }
    }

    // Validate exam submission from Supabase
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, code, status, duration")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (requestedExamId && requestedExamId !== exam.id) {
      return errorJson("BAD_REQUEST", "Exam ID mismatch", 400);
    }

    // Allow submission for draft exams (assignment type) and running exams
    const allowedStatuses = ["draft", "running"];
    if (!exam.status || !allowedStatuses.includes(exam.status)) {
      return errorJson("BAD_REQUEST", "Exam is no longer active", 400);
    }

    let ownedSession:
      | {
          id: string;
          student_id: string;
          exam_id: string;
          submitted_at: string | null;
          created_at: string;
          attempt_timer_started_at: string | null;
          started_at: string | null;
        }
      | null = null;

    if (sessionId) {
      const { data: existingSession, error: sessionError } = await getSupabase()
        .from("sessions")
        .select(
          "id, student_id, exam_id, submitted_at, created_at, attempt_timer_started_at, started_at"
        )
        .eq("id", sessionId)
        .single();

      if (sessionError || !existingSession) {
        return errorJson("NOT_FOUND", "Session not found", 404);
      }

      if (existingSession.student_id !== verifiedStudentId) {
        return errorJson("FORBIDDEN", "Session access denied", 403);
      }

      if (existingSession.exam_id !== exam.id) {
        return errorJson("BAD_REQUEST", "Session does not belong to this exam", 400);
      }

      if (existingSession.submitted_at) {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }

      ownedSession = existingSession;
    }

    // ✅ duration이 0이 아닐 때만 시간 만료 체크
    // duration === 0은 무제한(과제형)이므로 시간 체크를 건너뜀
    if (exam.duration !== 0 && ownedSession) {
      // Use attempt_timer_started_at (set when exam actually starts) > started_at > created_at
      const timerStart =
        ownedSession.attempt_timer_started_at ||
        ownedSession.started_at ||
        ownedSession.created_at;
      const sessionStartTime = new Date(timerStart).getTime();
      const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
      const gracePeriodMs = 30 * 1000; // 30초 grace period for network latency
      const sessionEndTime = sessionStartTime + examDurationMs + gracePeriodMs;
      const now = Date.now();

      // 시간이 지났으면 에러 반환 (단, duration이 0이 아닐 때만)
      if (now > sessionEndTime) {
        return errorJson("BAD_REQUEST", "시험 시간이 종료되었습니다.", 400);
      }
    }

    let actualSessionId = ownedSession?.id || null;

    try {
      if (!actualSessionId) {
        const { data: activeSession, error: activeSessionError } = await getSupabase()
          .from("sessions")
          .select("id")
          .eq("exam_id", exam.id)
          .eq("student_id", verifiedStudentId)
          .is("submitted_at", null)
          .maybeSingle();

        if (activeSessionError) {
          throw activeSessionError;
        }

        if (activeSession) {
          actualSessionId = activeSession.id;
        } else {
          const { data: submittedSession, error: submittedSessionError } =
            await getSupabase()
              .from("sessions")
              .select("id")
              .eq("exam_id", exam.id)
              .eq("student_id", verifiedStudentId)
              .not("submitted_at", "is", null)
              .maybeSingle();

          if (submittedSessionError) {
            throw submittedSessionError;
          }

          if (submittedSession) {
            return errorJson(
              "ALREADY_SUBMITTED",
              "This exam has already been submitted",
              409
            );
          }

          // Race-safe: upsert with ignoreDuplicates prevents duplicate sessions
          const { data: newSession, error: createError } = await getSupabase()
            .from("sessions")
            .upsert(
              {
                exam_id: exam.id,
                student_id: verifiedStudentId,
              },
              { onConflict: "exam_id,student_id", ignoreDuplicates: true }
            )
            .select()
            .maybeSingle();

          if (createError) {
            throw createError;
          }

          if (newSession) {
            actualSessionId = newSession.id;
          } else {
            // ignoreDuplicates skipped — fetch existing
            const { data: existing, error: fetchError } = await getSupabase()
              .from("sessions")
              .select("id")
              .eq("exam_id", exam.id)
              .eq("student_id", verifiedStudentId)
              .single();
            if (fetchError) throw fetchError;
            actualSessionId = existing.id;
          }
        }
      }

      if (!actualSessionId) {
        throw new Error("Failed to resolve submission session");
      }

      // Cold-start path: if ownedSession was null (no sessionId provided),
      // perform time check on the resolved session to prevent post-deadline submission
      if (!ownedSession && exam.duration !== 0) {
        const { data: resolvedSession } = await getSupabase()
          .from("sessions")
          .select("attempt_timer_started_at, started_at, created_at")
          .eq("id", actualSessionId)
          .single();
        if (resolvedSession) {
          const timerStart = resolvedSession.attempt_timer_started_at
            || resolvedSession.started_at || resolvedSession.created_at;
          const sessionStartTime = new Date(timerStart).getTime();
          const examDurationMs = exam.duration * 60 * 1000;
          const gracePeriodMs = 30 * 1000;
          if (Date.now() > sessionStartTime + examDurationMs + gracePeriodMs) {
            return errorJson("BAD_REQUEST", "시험 시간이 종료되었습니다.", 400);
          }
        }
      }

      const finalSessionId = actualSessionId;

      const submittedAt = new Date().toISOString();

      // ★ 답안 먼저 저장 (세션 상태 변경 전) — 답안 손실 방지
      // Store individual submissions BEFORE marking session as submitted
      const submissionInserts = answers.map(
        (answer: { text?: string } | string, index: number) => {
          const rawAnswerText =
            typeof answer === "string" ? answer : answer.text || "";

          // Preserve rich text HTML — sanitization happens at render time (DOMPurify)
          const answerText = rawAnswerText;

          const submissionData = {
            answer: answerText,
          };

          let compressedSubmissionData;
          let compressionMetadata;

          try {
            const compressed = compressData(submissionData);
            compressedSubmissionData = compressed.data;
            compressionMetadata = compressed.metadata;

            // Validate that compressed data is safe for JSON storage
            JSON.stringify({ compressed_data: compressedSubmissionData });
          } catch {
            // Fallback: store without compression
            compressedSubmissionData = null;
            compressionMetadata = {
              algorithm: "none",
              version: "1.0.0",
              originalSize: JSON.stringify(submissionData).length,
              compressedSize: JSON.stringify(submissionData).length,
              compressionRatio: 1.0,
              timestamp: new Date().toISOString(),
            };
          }

          return {
            session_id: finalSessionId,
            q_idx: index,
            answer: answerText,
            compressed_answer_data: compressedSubmissionData,
            compression_metadata: compressionMetadata,
          };
        }
      );

      const { error: submissionsError } = await getSupabase()
        .from("submissions")
        .upsert(submissionInserts, { onConflict: "session_id,q_idx" })
        .select();

      if (submissionsError) {
        throw new Error(
          `Database insert failed: ${submissionsError.message} (Code: ${submissionsError.code})`
        );
      }

      // Compress session data
      const sessionData = {
        chatHistory: chatHistory || [],
        answers: answers,
      };

      const compressedSessionData = compressData(sessionData);

      // ★ 세션 상태 변경은 답안 저장 성공 후에만 수행
      // Guard: only update if not already submitted (prevents duplicate submissions)
      const { data: updatedSession, error: updateSessionError } = await getSupabase()
        .from("sessions")
        .update({
          compressed_session_data: compressedSessionData.data,
          compression_metadata: compressedSessionData.metadata,
          submitted_at: submittedAt,
          status: "submitted",
          is_active: false,
        })
        .eq("id", finalSessionId)
        .eq("student_id", verifiedStudentId)
        .eq("exam_id", exam.id)
        .is("submitted_at", null)
        .select("id")
        .maybeSingle();

      if (!updatedSession && !updateSessionError) {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }

      // Atomic student_count increment (race-safe via RPC)
      const { error: rpcError } = await getSupabase().rpc(
        "increment_student_count",
        { p_exam_id: exam.id }
      );
      if (rpcError) {
        logError("Failed to increment student_count via RPC", rpcError, {
          path: "/api/feedback",
          additionalData: { examId: exam.id },
        });
      }

      // 백그라운드에서 자동 채점 시작 (채점 큐로 동시에 최대 3명만 채점)
      // 최대 2회 재시도 + exponential backoff (5s, 10s)
      const MAX_GRADING_RETRIES = 2;
      const gradeWithRetry = async () => {
        for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
          try {
            return await autoGradeSession(finalSessionId);
          } catch (error) {
            const isLastAttempt = attempt === MAX_GRADING_RETRIES;
            if (isLastAttempt) throw error;
            const delay = 5000 * Math.pow(2, attempt); // 5s, 10s
            logError(`Background grading attempt ${attempt + 1} failed, retrying in ${delay}ms`, error, {
              additionalData: { sessionId: finalSessionId, attempt },
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      };
      enqueueGrading(gradeWithRetry)
        .catch((error) => {
          logError("Background grading failed after all retries", error, {
            additionalData: { sessionId: finalSessionId },
          });
        });
    } catch (error) {
      logError("Failed to store submission in database", error, {
        path: "/api/feedback",
      });
      return errorJson(
        "INTERNAL_ERROR",
        "Failed to store submission in database",
        500
      );
    }

    // Audit log: session submit via feedback
    if (actualSessionId) {
      auditLog({
        action: "session_submit",
        userId: user.id,
        targetId: actualSessionId,
        details: { examId: exam.id, examCode },
      }).then((ok) => {
        if (!ok) {
          logError("[feedback] Audit log failed for session_submit", new Error("auditLog returned false"), {
            path: "/api/feedback",
            additionalData: { sessionId: actualSessionId, examId: exam.id },
          });
        }
      });
    }

    return successJson({
      timestamp: new Date().toISOString(),
      examCode,
      examId: exam.id,
      status: "submitted",
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
