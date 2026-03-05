export const maxDuration = 120;

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { compressData } from "@/lib/compression";
import { enqueueGrading } from "@/lib/openai";
import { autoGradeSession } from "@/lib/grading";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { sanitizeUserInput } from "@/lib/sanitize";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const { examCode, answers, examId, sessionId, chatHistory, studentId } =
      await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return errorJson("BAD_REQUEST", "Missing required fields", 400);
    }

    // Validate exam submission from Supabase
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", examCode)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if exam allows submission (draft, active, or running after instructor started)
    const allowedStatuses = ["active", "draft", "running"];
    if (!exam.status || !allowedStatuses.includes(exam.status)) {
      return errorJson("BAD_REQUEST", "Exam is no longer active", 400);
    }

    // ✅ duration이 0이 아닐 때만 시간 만료 체크
    // duration === 0은 무제한(과제형)이므로 시간 체크를 건너뜀
    if (exam.duration !== 0 && sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("created_at")
        .eq("id", sessionId)
        .single();

      if (!sessionError && session) {
        const sessionStartTime = new Date(session.created_at).getTime();
        const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
        const sessionEndTime = sessionStartTime + examDurationMs;
        const now = Date.now();

        // 시간이 지났으면 에러 반환 (단, duration이 0이 아닐 때만)
        if (now > sessionEndTime) {
          return errorJson("BAD_REQUEST", "시험 시간이 종료되었습니다.", 400);
        }
      }
    }

    // Store submission data in database
    if (studentId) {
      try {
        let actualSessionId = sessionId;

        // If sessionId is provided, verify it exists and belongs to this student
        if (sessionId) {
          const { data: existingSession, error: sessionError } = await supabase
            .from("sessions")
            .select("id, student_id, exam_id")
            .eq("id", sessionId)
            .single();

          if (sessionError || !existingSession) {
            throw new Error("Invalid session ID");
          }

          if (
            existingSession.student_id !== studentId ||
            existingSession.exam_id !== examId
          ) {
            throw new Error("Session does not belong to this student/exam");
          }

          actualSessionId = existingSession.id;
        } else {
          // Fallback: Create or get session for this exam (legacy behavior)
          const { data: session, error: sessionError } = await supabase
            .from("sessions")
            .select("id")
            .eq("exam_id", examId)
            .eq("student_id", studentId)
            .single();

          if (sessionError || !session) {
            // Create new session
            const { data: newSession, error: createError } = await supabase
              .from("sessions")
              .insert([
                {
                  exam_id: examId,
                  student_id: studentId,
                  submitted_at: new Date().toISOString(),
                },
              ])
              .select()
              .single();

            if (createError) throw createError;
            actualSessionId = newSession.id;
          } else {
            actualSessionId = session.id;
          }
        }

        // Compress session data
        const sessionData = {
          chatHistory: chatHistory || [],
          answers: answers,
        };

        const compressedSessionData = compressData(sessionData);

        // Update session with compressed data and deactivate
        // Guard: only update if not already submitted (prevents duplicate submissions)
        const { data: updatedSession, error: updateSessionError } = await supabase
          .from("sessions")
          .update({
            compressed_session_data: compressedSessionData.data,
            compression_metadata: compressedSessionData.metadata,
            submitted_at: new Date().toISOString(),
            is_active: false, // Deactivate session on submission
          })
          .eq("id", actualSessionId)
          .is("submitted_at", null)
          .select("id")
          .maybeSingle();

        if (!updatedSession && !updateSessionError) {
          return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
        }

        // Store individual submissions
        const submissionInserts = answers.map(
          (answer: { text?: string } | string, index: number) => {
            const rawAnswerText =
              typeof answer === "string" ? answer : answer.text || "";

            // Sanitize the answer text to prevent JSON encoding issues
            const answerText = sanitizeUserInput(rawAnswerText);

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
            } catch (compressionError) {
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
              session_id: actualSessionId,
              q_idx: index,
              answer: answerText,
              compressed_answer_data: compressedSubmissionData,
              compression_metadata: compressionMetadata,
            };
          }
        );

        const { data: insertedSubmissions, error: submissionsError } =
          await supabase.from("submissions").insert(submissionInserts).select();

        if (submissionsError) {
          throw new Error(
            `Database insert failed: ${submissionsError.message} (Code: ${submissionsError.code})`
          );
        }

        // Atomic student_count increment (race-safe via RPC)
        const { error: rpcError } = await supabase.rpc(
          "increment_student_count",
          { p_exam_id: examId }
        );
        if (rpcError) {
          // Fallback: non-atomic increment if RPC not available
          const { data: currentExam } = await supabase
            .from("exams")
            .select("student_count")
            .eq("id", examId)
            .single();

          await supabase
            .from("exams")
            .update({
              student_count: (currentExam?.student_count || 0) + 1,
            })
            .eq("id", examId);
        }

        // 백그라운드에서 자동 채점 시작 (채점 큐로 동시에 최대 3명만 채점)
        // 최대 2회 재시도 + exponential backoff (5s, 10s)
        if (actualSessionId) {
          const MAX_GRADING_RETRIES = 2;
          const gradeWithRetry = async () => {
            for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
              try {
                return await autoGradeSession(actualSessionId);
              } catch (error) {
                const isLastAttempt = attempt === MAX_GRADING_RETRIES;
                if (isLastAttempt) throw error;
                const delay = 5000 * Math.pow(2, attempt); // 5s, 10s
                logError(`Background grading attempt ${attempt + 1} failed, retrying in ${delay}ms`, error, {
                  additionalData: { sessionId: actualSessionId, attempt },
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          };
          enqueueGrading(gradeWithRetry)
            .catch((error) => {
              logError("Background grading failed after all retries", error, {
                additionalData: { sessionId: actualSessionId },
              });
            });
        }
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
    }

    // Audit log: session submit via feedback
    if (user && sessionId) {
      auditLog({
        action: "session_submit",
        userId: user.id,
        targetId: sessionId,
        details: { examId, examCode },
      });
    }

    return successJson({
      timestamp: new Date().toISOString(),
      examCode,
      examId,
      status: "submitted",
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
