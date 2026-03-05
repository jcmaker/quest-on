import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { autoGradeSession } from "@/lib/grading";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { batchGetUserInfo } from "@/lib/clerk-users";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session data first (including ai_summary for auto-graded summary)
    // ai_summary가 없을 수 있으므로 안전하게 처리
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id, submitted_at, used_clarifications, created_at, compressed_session_data, compression_metadata, ai_summary")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404, {
        details: sessionError?.message,
        sessionId,
      });
    }

    // Get exam data
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, instructor_id, questions, rubric")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404, {
        details: examError?.message,
      });
    }

    // Normalize questions format (text -> prompt)
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        idx: q.idx,
        type: q.type,
        prompt: q.prompt || q.text, // Support both field names
        ai_context: q.ai_context,
      }));
    }

    // Optimized: Fetch submissions, messages, grades, and paste_logs in parallel
    const [submissionsResult, messagesResult, gradesResult, pasteLogsResult] =
      await Promise.all([
        supabase
          .from("submissions")
          .select(
            `
          id,
          q_idx,
          answer,
          compressed_answer_data,
          compression_metadata,
          created_at
        `
          )
          .eq("session_id", sessionId),
        supabase
          .from("messages")
          .select(
            `
          id,
          q_idx,
          role,
          content,
          compressed_content,
          compression_metadata,
          created_at
        `
          )
          .eq("session_id", sessionId),
        supabase
          .from("grades")
          .select(
            `
          id,
          q_idx,
          score,
          comment,
          stage_grading,
          grade_type,
          created_at
        `
          )
          .eq("session_id", sessionId),
        supabase
          .from("paste_logs")
          .select(
            `
          id,
          question_id,
          length,
          pasted_text,
          paste_start,
          paste_end,
          answer_length_before,
          is_internal,
          suspicious,
          timestamp,
          created_at
        `
          )
          .eq("session_id", sessionId)
          .order("timestamp", { ascending: true }),
      ]);

    const { data: submissions, error: submissionsError } = submissionsResult;
    const { data: messages, error: messagesError } = messagesResult;
    const { data: grades, error: gradesError } = gradesResult;
    const { data: pasteLogs, error: pasteLogsError } = pasteLogsResult;

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get student info from Clerk (batch call for consistency)
    const clerkUserMap = await batchGetUserInfo([session.student_id]);
    const clerkStudentInfo = clerkUserMap.get(session.student_id) ?? null;

    // Get student profile from database
    const { data: studentProfile } = await supabase
      .from("student_profiles")
      .select("name, student_number, school")
      .eq("student_id", session.student_id)
      .single();

    // Merge Clerk info with profile info (prefer profile name if available)
    const studentInfo = {
      name:
        studentProfile?.name ||
        clerkStudentInfo?.name ||
        `Student ${session.student_id.slice(0, 8)}`,
      email: clerkStudentInfo?.email || `${session.student_id}@example.com`,
      student_number: studentProfile?.student_number,
      school: studentProfile?.school,
    };

    // Decompress session data if available
    let decompressedSessionData = null;
    if (
      session.compressed_session_data &&
      typeof session.compressed_session_data === "string"
    ) {
      try {
        decompressedSessionData = decompressData(
          session.compressed_session_data
        );
      } catch (error) {
        logError("Error decompressing session data", error, {
          path: `/api/session/${sessionId}/grade`,
        });
      }
    }

    // Decompress and organize submissions by question index
    const submissionsByQuestion: Record<string, unknown> = {};
    if (submissions) {
      submissions.forEach((submission: Record<string, unknown>) => {
        const qIdx = submission.q_idx as number;
        let decompressedAnswerData = null;

        if (
          submission.compressed_answer_data &&
          typeof submission.compressed_answer_data === "string"
        ) {
          try {
            decompressedAnswerData = decompressData(
              submission.compressed_answer_data as string
            );
          } catch (error) {
            logError("Error decompressing answer data", error, {
              path: `/api/session/${sessionId}/grade`,
            });
          }
        }

        submissionsByQuestion[qIdx] = {
          ...submission,
          decompressed: {
            answerData: decompressedAnswerData,
          },
        };
      });
    }

    // Organize messages by question index and separate AI conversation and feedback
    const messagesByQuestion: Record<string, unknown> = {};
    if (messages) {
      messages.forEach((message: Record<string, unknown>) => {
        const qIdx = message.q_idx as number;
        let decompressedContent = null;

        if (
          message.compressed_content &&
          typeof message.compressed_content === "string"
        ) {
          try {
            decompressedContent = decompressData(
              message.compressed_content as string
            );
          } catch (error) {
            logError("Error decompressing message content", error, {
              path: `/api/session/${sessionId}/grade`,
            });
          }
        }

        const messageData = {
          id: message.id,
          role: message.role,
          content: decompressedContent || message.content,
          created_at: message.created_at,
        };

        // Store by q_idx
        if (!messagesByQuestion[qIdx]) {
          messagesByQuestion[qIdx] = [];
        }
        (messagesByQuestion[qIdx] as Array<Record<string, unknown>>).push(
          messageData
        );

        // Also try to map q_idx to question index for backward compatibility
        // Find the question with matching id (considering the conversion formula)
        if (exam.questions && Array.isArray(exam.questions)) {
          const questionIndex = exam.questions.findIndex(
            (q: { id?: string | number }) => {
              if (!q.id) return false;
              // Check if q_idx matches the converted question.id
              const convertedId = Math.abs(parseInt(String(q.id)) % 2147483647);
              return convertedId === qIdx || String(q.id) === String(qIdx);
            }
          );

          if (questionIndex !== -1 && questionIndex !== qIdx) {
            if (!messagesByQuestion[questionIndex]) {
              messagesByQuestion[questionIndex] = [];
            }
            (
              messagesByQuestion[questionIndex] as Array<
                Record<string, unknown>
              >
            ).push(messageData);
          }
        }
      });

      // Sort messages by created_at within each question
      Object.keys(messagesByQuestion).forEach((qIdx) => {
        (messagesByQuestion[qIdx] as Array<Record<string, unknown>>).sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            new Date(a.created_at as string).getTime() -
            new Date(b.created_at as string).getTime()
        );
      });
    }

    // Organize grades by question index
    const gradesByQuestion: Record<string, unknown> = {};
    if (grades) {
      grades.forEach((grade: Record<string, unknown>) => {
        const qIdx = grade.q_idx as number;
        gradesByQuestion[qIdx] = grade;
      });
    }

    // Organize paste logs by question_id
    const pasteLogsByQuestion: Record<string, unknown[]> = {};
    if (pasteLogs) {
      pasteLogs.forEach((log: Record<string, unknown>) => {
        const questionId = log.question_id as string;
        if (questionId) {
          if (!pasteLogsByQuestion[questionId]) {
            pasteLogsByQuestion[questionId] = [];
          }
          pasteLogsByQuestion[questionId].push(log);
        }
      });
    }

    // Calculate overall score if grades exist
    let overallScore = null;
    if (grades && grades.length > 0) {
      const totalScore = (grades as Array<Record<string, unknown>>).reduce(
        (sum: number, grade: Record<string, unknown>) =>
          sum + ((grade.score as number) || 0),
        0
      );
      const questionCount = exam.questions?.length || 1;
      overallScore = Math.round(totalScore / questionCount);
    }

    const responseData = {
      session: {
        id: session.id,
        exam_id: session.exam_id,
        student_id: session.student_id,
        submitted_at: session.submitted_at,
        used_clarifications: session.used_clarifications,
        created_at: session.created_at,
        decompressed: decompressedSessionData,
        ai_summary: session.ai_summary || null, // 서버 사이드 자동 채점 요약 평가
      },
      exam: exam,
      student: studentInfo,
      submissions: submissionsByQuestion,
      messages: messagesByQuestion,
      grades: gradesByQuestion, // 서버 사이드 자동 채점 점수
      pasteLogs: pasteLogsByQuestion, // 부정행위 의심 로그 (question_id별로 그룹화)
      overallScore,
      aiSummary: session.ai_summary || null, // 하위 호환성을 위해 유지
    };

    return successJson(responseData);
  } catch (error) {
    logError("Grade GET handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      (error as Error)?.message || "Internal server error",
      500
    );
  }
}

// Save or update grades
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json();
    const { questionIdx, score, comment, stageGrading } = body;

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session to verify instructor owns the exam
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // Get exam to check instructor
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Upsert grade (atomic: handles concurrent grading safely)
    const { data: result, error: gradeError } = await supabase
      .from("grades")
      .upsert(
        {
          session_id: sessionId,
          q_idx: questionIdx,
          score,
          comment,
          stage_grading: stageGrading || null,
          grade_type: "manual",
        },
        { onConflict: "session_id,q_idx" }
      )
      .select()
      .single();

    if (gradeError) throw gradeError;

    // Audit log: fire-and-forget with error catching
    try {
      await auditLog({
        action: "grade_update",
        userId: user.id,
        targetId: sessionId,
        details: { questionIdx, score, comment: comment?.slice(0, 200) },
      });
    } catch (auditError) {
      // Log but don't block the response
      logError("[grade] Audit log failed", auditError, { path: `/api/session/${sessionId}/grade` });
    }

    return successJson({
      grade: result,
    });
  } catch (error) {
    logError("Grade POST handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      (error as Error)?.message || "Internal server error",
      500
    );
  }
}

// Auto-grade all questions based on rubric — delegates to autoGradeSession()
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    const { forceRegrade = false } = body;

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Verify session exists and instructor owns the exam
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id, rubric")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam || exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Rate limit: expensive OpenAI auto-grading
    const rl = await checkRateLimitAsync(`ai:auto-grade:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many grading requests. Please wait.", 429);
    }

    // Validate rubric exists before auto-grading
    if (!exam.rubric || !Array.isArray(exam.rubric) || exam.rubric.length === 0) {
      return errorJson(
        "RUBRIC_REQUIRED",
        "루브릭이 설정되지 않아 자동 채점을 할 수 없습니다. 시험 편집에서 루브릭을 먼저 추가해주세요.",
        400
      );
    }

    // Check if already graded (unless force regrade)
    if (!forceRegrade) {
      const { data: existingGrades } = await supabase
        .from("grades")
        .select("q_idx")
        .eq("session_id", sessionId);

      if (existingGrades && existingGrades.length > 0) {
        return successJson({ message: "Already graded", skipped: true });
      }
    } else {
      await supabase.from("grades").delete().eq("session_id", sessionId);
    }

    // Delegate to centralized grading logic (parallel, retry, timeout)
    const { grades, summary, failedQuestions, timedOut } = await autoGradeSession(sessionId);

    const response: Record<string, unknown> = {
      gradesCount: grades.length,
      grades,
      summary,
    };

    if (failedQuestions.length > 0 || timedOut) {
      response.warning = `${grades.length}/${grades.length + failedQuestions.length} 문항 채점 완료, ${failedQuestions.length}문항 수동 채점 필요`;
      response.failedQuestions = failedQuestions;
      response.timedOut = timedOut;
    }

    return successJson(response);
  } catch (error) {
    logError("Grade PUT handler error", error, {
      path: `/api/session/grade`,
    });
    return errorJson(
      "INTERNAL_ERROR",
      (error as Error)?.message || "Unknown error occurred",
      500,
      (error as Error)?.message
    );
  }
}
