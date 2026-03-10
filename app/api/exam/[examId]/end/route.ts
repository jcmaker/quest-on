export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { validateUUID } from "@/lib/validate-params";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { compressData } from "@/lib/compression";
import { enqueueGrading } from "@/lib/openai";
import { autoGradeSession } from "@/lib/grading";

// P1-4: Supabase client created inside handler, not module-level
function getSupabase() {
  return getSupabaseServer();
}

/**
 * POST /api/exam/[examId]/end
 *
 * Gate End 신호: 교수가 "End Exam" 버튼을 클릭하면
 * - exams.status를 "closed"로 변경
 * - 비상 강제 종료 (모든 진행 중 시험 종료)
 * - 주의: close_at은 입장 마감이므로, 이 API는 강제 종료용
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(`exam-end:${user.id}`, RATE_LIMITS.examControl);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const resolvedParams = await params;
    const examId = resolvedParams.examId;

    const invalidId = validateUUID(examId, "examId");
    if (invalidId) return invalidId;

    // 1. 시험 정보 확인 및 권한 검증
    const { data: exam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, instructor_id, status, duration")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 2. 상태 검증: Running 또는 EntryClosed 상태에서만 End 가능
    const validStatuses = ["running", "entry_closed"];
    if (!validStatuses.includes(exam.status || "")) {
      return errorJson(
        "BAD_REQUEST",
        "Exam must be in 'running' or 'entry_closed' status to end",
        400,
        { currentStatus: exam.status }
      );
    }

    const now = new Date().toISOString();

    // 3. 시험 상태를 "closed"로 변경
    const { error: updateExamError } = await getSupabase()
      .from("exams")
      .update({
        status: "closed",
        updated_at: now,
      })
      .eq("id", examId);

    if (updateExamError) {
      return errorJson("INTERNAL_ERROR", "Failed to end exam", 500);
    }

    // 4. 모든 진행 중 세션 강제 제출 + 대기 중 세션 정리 (재시도 로직 포함)
    // Also close "waiting" sessions that never started
    const { error: waitingCloseError } = await getSupabase()
      .from("sessions")
      .update({
        status: "closed",
        is_active: false,
      })
      .eq("exam_id", examId)
      .eq("status", "waiting");

    if (waitingCloseError) {
      logError("Failed to close waiting sessions", waitingCloseError, {
        path: "/api/exam/end",
      });
    }

    const { data: activeSessions, error: sessionsError } = await getSupabase()
      .from("sessions")
      .select("id, submitted_at")
      .eq("exam_id", examId)
      .eq("status", "in_progress")
      .is("submitted_at", null);

    let sessionsForceSubmitted = 0;
    let forceSubmitFailed: string[] = [];

    if (!sessionsError && activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);

      // 1차 시도: 일괄 업데이트
      const { error: batchError } = await getSupabase()
        .from("sessions")
        .update({
          status: "submitted",
          submitted_at: now,
          auto_submitted: true,
        })
        .in("id", sessionIds)
        .is("submitted_at", null);

      if (!batchError) {
        sessionsForceSubmitted = sessionIds.length;
      } else {
        // 2차 시도: 개별 업데이트로 폴백
        for (const sid of sessionIds) {
          const { error: individualError } = await getSupabase()
            .from("sessions")
            .update({
              status: "submitted",
              submitted_at: now,
              auto_submitted: true,
            })
            .eq("id", sid)
            .is("submitted_at", null);

          if (!individualError) {
            sessionsForceSubmitted++;
          } else {
            forceSubmitFailed.push(sid);
          }
        }
      }
    }

    // 5. 강제 종료된 세션들의 compressed 데이터 보강
    // 정상 제출 시 생성되는 compressed_session_data, compressed_answer_data를
    // 기존 draft submissions/messages로부터 생성
    let sessionsDataEnriched = 0;
    const dataEnrichErrors: string[] = [];

    if (sessionsForceSubmitted > 0) {
      const supabase = getSupabase();
      const enrichedSessionIds = !sessionsError && activeSessions
        ? activeSessions.map((s) => s.id)
        : [];

      const enrichResults = await Promise.allSettled(
        enrichedSessionIds.map(async (sessionId) => {
          // 해당 세션의 기존 draft submissions 조회
          const [subsResult, msgsResult] = await Promise.all([
            supabase
              .from("submissions")
              .select("id, q_idx, answer, compressed_answer_data")
              .eq("session_id", sessionId)
              .order("q_idx", { ascending: true }),
            supabase
              .from("messages")
              .select("q_idx, role, content, created_at")
              .eq("session_id", sessionId)
              .order("created_at", { ascending: true }),
          ]);

          if (subsResult.error) throw new Error(`Failed to fetch submissions: ${subsResult.error.message}`);
          if (msgsResult.error) throw new Error(`Failed to fetch messages: ${msgsResult.error.message}`);

          const submissions = subsResult.data || [];
          const messages = msgsResult.data || [];

          // compressed_answer_data가 없는 submissions에 압축 데이터 채우기
          const submissionsToUpdate = submissions.filter(
            (s) => !s.compressed_answer_data && s.answer
          );

          for (const sub of submissionsToUpdate) {
            try {
              const compressed = compressData({ answer: sub.answer });
              await supabase
                .from("submissions")
                .update({
                  compressed_answer_data: compressed.data,
                  compression_metadata: compressed.metadata,
                })
                .eq("id", sub.id);
            } catch (err) {
              logError("Failed to compress answer data for force-submitted session", err, {
                path: "/api/exam/end",
                additionalData: { sessionId, submissionId: sub.id },
              });
            }
          }

          // compressed_session_data 생성 (chatHistory + answers)
          const answers = submissions.map((s) =>
            typeof s.answer === "string" ? s.answer : ""
          );
          const sessionData = {
            chatHistory: messages.map((m) => ({
              type: m.role === "user" ? "student" : "ai",
              content: m.content,
              timestamp: m.created_at,
            })),
            answers,
          };

          const compressedSession = compressData(sessionData);
          await supabase
            .from("sessions")
            .update({
              compressed_session_data: compressedSession.data,
              compression_metadata: compressedSession.metadata,
            })
            .eq("id", sessionId);
        })
      );

      for (const result of enrichResults) {
        if (result.status === "fulfilled") {
          sessionsDataEnriched++;
        } else {
          dataEnrichErrors.push(result.reason?.message || "Unknown error");
          logError("Failed to enrich force-submitted session data", result.reason, {
            path: "/api/exam/end",
          });
        }
      }

      // 6. 강제 종료된 세션들의 자동 채점
      const MAX_GRADING_RETRIES = 2;
      for (const sessionId of enrichedSessionIds) {
        const gradeWithRetry = async () => {
          for (let attempt = 0; attempt <= MAX_GRADING_RETRIES; attempt++) {
            try {
              return await autoGradeSession(sessionId);
            } catch (error) {
              if (attempt === MAX_GRADING_RETRIES) throw error;
              const delay = 5000 * Math.pow(2, attempt);
              logError(`Force-end grading attempt ${attempt + 1} failed`, error, {
                additionalData: { sessionId, attempt },
              });
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        };
        enqueueGrading(gradeWithRetry).catch((error) => {
          logError("Force-end grading failed after retries", error, {
            additionalData: { sessionId },
          });
        });
      }
    }

    return successJson({
      examId,
      status: "closed",
      endedAt: now,
      sessionsForceSubmitted,
      sessionsDataEnriched,
      ...(forceSubmitFailed.length > 0 && {
        forceSubmitFailed,
        warning: `${forceSubmitFailed.length} session(s) failed to force-submit`,
      }),
      ...(dataEnrichErrors.length > 0 && {
        dataEnrichWarnings: dataEnrichErrors,
      }),
    });
  } catch (error) {
    logError("Failed to end exam", error, { path: "/api/exam/end" });
    return errorJson("INTERNAL_ERROR", "Failed to end exam", 500);
  }
}
