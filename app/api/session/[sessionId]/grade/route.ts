import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";
import { openai, AI_MODEL } from "@/lib/openai";
import {
  buildChatGradingSystemPrompt,
  buildAnswerGradingSystemPrompt,
} from "@/lib/prompts";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { batchGetUserInfo } from "@/lib/clerk-users";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { sessionId } = await params;
    console.log("🔍 Fetching session for grading:", sessionId);

    const user = await currentUser();

    if (!user) {
      console.log("❌ No user found");
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    console.log("✅ User authenticated:", user.id);

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session data first (including ai_summary for auto-graded summary)
    // ai_summary가 없을 수 있으므로 안전하게 처리
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.log("❌ Session not found:", sessionError);
      return errorJson("NOT_FOUND", "Session not found", 404, {
        details: sessionError?.message,
        sessionId,
      });
    }

    console.log("✅ Session found:", session.id);

    // Get exam data
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, instructor_id, questions, rubric")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      console.log("❌ Exam not found:", examError);
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

    console.log("📝 Exam data:", {
      id: exam.id,
      title: exam.title,
      questionsType: typeof exam.questions,
      questionsIsArray: Array.isArray(exam.questions),
      questionsLength: Array.isArray(exam.questions)
        ? exam.questions.length
        : 0,
      questions: exam.questions,
    });

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
          ai_feedback,
          student_reply,
          compressed_answer_data,
          compressed_feedback_data,
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

    if (submissionsError) {
      console.log("⚠️ Error fetching submissions:", submissionsError);
    } else {
      console.log("📤 Submissions fetched:", {
        count: submissions?.length || 0,
      });
    }

    if (messagesError) {
      console.log("⚠️ Error fetching messages:", messagesError);
    } else {
      console.log("💬 Messages fetched:", {
        count: messages?.length || 0,
      });
    }

    if (gradesError) {
      console.log("⚠️ Error fetching grades:", gradesError);
    }

    if (pasteLogsError) {
      console.log("⚠️ Error fetching paste logs:", pasteLogsError);
    } else {
      console.log("📋 Paste logs fetched:", {
        count: pasteLogs?.length || 0,
        suspiciousCount: pasteLogs?.filter((log) => log.suspicious).length || 0,
      });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      console.log("❌ Instructor mismatch:", {
        examInstructorId: exam.instructor_id,
        userId: user.id,
      });
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    console.log("✅ Instructor verified");

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
        console.error("Error decompressing session data:", error);
      }
    }

    // Decompress and organize submissions by question index
    const submissionsByQuestion: Record<string, unknown> = {};
    if (submissions) {
      submissions.forEach((submission: Record<string, unknown>) => {
        const qIdx = submission.q_idx as number;
        let decompressedAnswerData = null;
        let decompressedFeedbackData = null;

        if (
          submission.compressed_answer_data &&
          typeof submission.compressed_answer_data === "string"
        ) {
          try {
            decompressedAnswerData = decompressData(
              submission.compressed_answer_data as string
            );
          } catch (error) {
            console.error("Error decompressing answer data:", error);
          }
        }

        if (
          submission.compressed_feedback_data &&
          typeof submission.compressed_feedback_data === "string"
        ) {
          try {
            decompressedFeedbackData = decompressData(
              submission.compressed_feedback_data as string
            );
          } catch (error) {
            console.error("Error decompressing feedback data:", error);
          }
        }

        submissionsByQuestion[qIdx] = {
          ...submission,
          decompressed: {
            answerData: decompressedAnswerData,
            feedbackData: decompressedFeedbackData,
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
            console.error("Error decompressing message content:", error);
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
            console.log(
              `📍 Mapping message from q_idx ${qIdx} to question index ${questionIndex}`
            );
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

    console.log("📊 Response data summary:", {
      hasAiSummary: !!session.ai_summary,
      gradesCount: grades?.length || 0,
      overallScore,
      gradesByQuestionKeys: Object.keys(gradesByQuestion),
    });

    console.log("📦 Returning response data:", {
      examQuestionsLength: exam.questions?.length || 0,
      submissionsKeys: Object.keys(submissionsByQuestion),
      messagesKeys: Object.keys(messagesByQuestion),
      gradesKeys: Object.keys(gradesByQuestion),
    });

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Session grading GET completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Grading data retrieved | Session: ${sessionId} | Exam: ${exam.code} | Student: ${session.student_id}`
    );

    return successJson(responseData);
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Get session for grading error:", error);
    console.error(
      `❌ [ERROR] Session grading GET failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
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
    const user = await currentUser();
    const body = await request.json();
    const { questionIdx, score, comment, stageGrading } = body;

    console.log(
      `📊 [GRADING] Grade submission | Session: ${sessionId} | Question: ${questionIdx} | Score: ${score}`
    );

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

    // Check if grade already exists for this question
    const { data: existingGrade } = await supabase
      .from("grades")
      .select("id")
      .eq("session_id", sessionId)
      .eq("q_idx", questionIdx)
      .single();

    let result;
    if (existingGrade) {
      // Update existing grade
      const { data, error } = await supabase
        .from("grades")
        .update({
          score,
          comment,
          stage_grading: stageGrading || null,
        })
        .eq("id", existingGrade.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new grade
      const { data, error } = await supabase
        .from("grades")
        .insert([
          {
            session_id: sessionId,
            q_idx: questionIdx,
            score,
            comment,
            stage_grading: stageGrading || null,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(`⏱️  [PERFORMANCE] Grade saved in ${requestDuration}ms`);
    console.log(
      `✅ [SUCCESS] Grade saved | Session: ${sessionId} | Question: ${questionIdx} | Score: ${score}`
    );

    // Audit log: grade update
    auditLog({
      action: "grade_update",
      userId: user.id,
      targetId: sessionId,
      details: { questionIdx, score, comment: comment?.slice(0, 200) },
    });

    return successJson({
      grade: result,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Save grade error:", error);
    console.error(
      `❌ [ERROR] Grade save failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

// Auto-grade all questions based on rubric
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestStartTime = Date.now();
  try {
    const { sessionId } = await params;
    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    const { forceRegrade = false } = body;

    console.log(
      `🤖 [AUTO_GRADE] Starting auto-grading | Session: ${sessionId} | Force: ${forceRegrade}`
    );

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("NOT_FOUND", "Session not found", 404);
    }

    // Get exam with rubric
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, questions, rubric, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("NOT_FOUND", "Exam not found", 404);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Check if already graded (unless force regrade)
    if (!forceRegrade) {
      const { data: existingGrades } = await supabase
        .from("grades")
        .select("q_idx")
        .eq("session_id", sessionId);

      if (existingGrades && existingGrades.length > 0) {
        console.log(
          `⚠️ [AUTO_GRADE] Grades already exist, skipping auto-grade`
        );
        return successJson({
          message: "Already graded",
          skipped: true,
        });
      }
    } else {
      // Delete existing grades if force regrade
      await supabase.from("grades").delete().eq("session_id", sessionId);
    }

    // Get submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select(
        `
        id,
        q_idx,
        answer,
        ai_feedback,
        student_reply,
        compressed_answer_data,
        compressed_feedback_data
      `
      )
      .eq("session_id", sessionId);

    if (submissionsError) {
      console.error("Error fetching submissions:", submissionsError);
    }

    console.log(
      `📤 [AUTO_GRADE] Found ${submissions?.length || 0} submissions`
    );

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select(
        `
        id,
        q_idx,
        role,
        content,
        compressed_content,
        created_at
      `
      )
      .eq("session_id", sessionId);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    // Decompress submissions
    const submissionsByQuestion: Record<
      number,
      {
        answer: string;
        ai_feedback?: string;
        student_reply?: string;
      }
    > = {};

    if (submissions) {
      submissions.forEach((submission: Record<string, unknown>) => {
        const qIdx = submission.q_idx as number;
        let answer = submission.answer as string;

        if (
          submission.compressed_answer_data &&
          typeof submission.compressed_answer_data === "string"
        ) {
          try {
            const decompressed = decompressData(
              submission.compressed_answer_data as string
            );
            answer = (decompressed as { answer?: string })?.answer || answer;
          } catch (error) {
            console.error("Error decompressing answer data:", error);
          }
        }

        submissionsByQuestion[qIdx] = {
          answer: answer || "",
          ai_feedback:
            typeof submission.ai_feedback === "string"
              ? submission.ai_feedback
              : undefined,
          student_reply:
            typeof submission.student_reply === "string"
              ? submission.student_reply
              : undefined,
        };
      });

      console.log(
        `📦 [AUTO_GRADE] Processed submissions for q_idx: ${Object.keys(
          submissionsByQuestion
        ).join(", ")}`
      );
    }

    // Decompress and organize messages by question
    const messagesByQuestion: Record<
      number,
      Array<{ role: string; content: string }>
    > = {};

    if (messages) {
      messages.forEach((message: Record<string, unknown>) => {
        const qIdx = message.q_idx as number;
        let content = message.content as string;

        if (
          message.compressed_content &&
          typeof message.compressed_content === "string"
        ) {
          try {
            content =
              (decompressData(
                message.compressed_content as string
              ) as string) || content;
          } catch (error) {
            console.error("Error decompressing message content:", error);
          }
        }

        if (!messagesByQuestion[qIdx]) {
          messagesByQuestion[qIdx] = [];
        }

        messagesByQuestion[qIdx].push({
          role: message.role as string,
          content: content || "",
        });
      });
    }

    // Normalize questions
    const questions = exam.questions
      ? Array.isArray(exam.questions)
        ? exam.questions.map((q: Record<string, unknown>, index: number) => ({
            id: q.id,
            idx: q.idx !== undefined ? (q.idx as number) : index,
            type: q.type,
            prompt: q.prompt || q.text,
            ai_context: q.ai_context,
          }))
        : []
      : [];

    console.log(
      `📝 [AUTO_GRADE] Questions: ${questions.length}, Submissions: ${
        submissions?.length || 0
      }`
    );

    // Auto-grade each question
    const grades: Array<{
      q_idx: number;
      score: number;
      comment: string;
      stage_grading?: {
        chat?: { score: number; comment: string };
        answer?: { score: number; comment: string };
      };
    }> = [];

    for (const question of questions) {
      const qIdx = question.idx as number;
      // Try to find submission by q_idx, if not found try by question index
      let submission = submissionsByQuestion[qIdx];
      if (!submission && questions.indexOf(question) >= 0) {
        const questionIndex = questions.indexOf(question);
        submission = submissionsByQuestion[questionIndex];
      }
      const questionMessages = messagesByQuestion[qIdx] || [];

      console.log(
        `🔍 [AUTO_GRADE] Processing question ${qIdx}: submission=${!!submission}, messages=${
          questionMessages.length
        }, answer=${submission?.answer ? "yes" : "no"}`
      );

      if (!submission) {
        console.log(
          `⚠️ [AUTO_GRADE] No submission found for question ${qIdx}, skipping`
        );
        continue;
      }

      // Build rubric text
      const rubricText =
        exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
          ? `
**평가 루브릭 기준:**
${exam.rubric
  .map(
    (
      item: {
        evaluationArea: string;
        detailedCriteria: string;
      },
      index: number
    ) =>
      `${index + 1}. ${item.evaluationArea}
           - 세부 기준: ${item.detailedCriteria}`
  )
  .join("\n")}
`
          : "";

      const stageGrading: {
        chat?: { score: number; comment: string };
        answer?: { score: number; comment: string };
      } = {};

      // 1. Chat stage grading
      if (questionMessages.length > 0) {
        try {
          const chatSystemPrompt = buildChatGradingSystemPrompt({
            rubricText,
            // rubricScoresSchema 없음 (이 엔드포인트는 루브릭별 점수를 반환하지 않음)
          });

          const chatUserPrompt = `다음 정보를 바탕으로 채팅 단계를 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생과 AI의 대화 기록:**
${questionMessages
  .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
  .join("\n\n")}

위 정보를 바탕으로 루브릭 기준에 따라 채팅 단계의 점수와 피드백을 제공해주세요.`;

          const chatCompletion = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "system", content: chatSystemPrompt },
              { role: "user", content: chatUserPrompt },
            ],
            response_format: { type: "json_object" },
          });

          const chatResponseContent =
            chatCompletion.choices[0]?.message?.content || "";
          let chatParsedResponse;
          try {
            chatParsedResponse = JSON.parse(chatResponseContent);
          } catch (parseError) {
            console.error(
              `❌ [AUTO_GRADE] JSON parse error for chat stage question ${qIdx}:`,
              parseError
            );
            throw new Error(`JSON parse error: ${parseError}`);
          }

          stageGrading.chat = {
            score: Math.max(
              0,
              Math.min(100, Math.round(chatParsedResponse.score || 0))
            ),
            comment: chatParsedResponse.comment || "채팅 단계 평가 완료",
          };

          console.log(
            `✅ [AUTO_GRADE] Question ${qIdx} chat stage graded: ${stageGrading.chat.score}점`
          );
        } catch (error) {
          console.error(
            `❌ [AUTO_GRADE] Error grading chat stage for question ${qIdx}:`,
            error
          );
        }
      }

      // 2. Answer stage grading
      if (submission.answer) {
        try {
          const answerSystemPrompt = buildAnswerGradingSystemPrompt({
            rubricText,
            // rubricScoresSchema 없음 (이 엔드포인트는 루브릭별 점수를 반환하지 않음)
          });

          const answerUserPrompt = `다음 정보를 바탕으로 최종 답안을 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생의 최종 답안:**
${submission.answer || "답안이 없습니다."}

위 정보를 바탕으로 루브릭 기준에 따라 답안의 점수와 피드백을 제공해주세요.`;

          const answerCompletion = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "system", content: answerSystemPrompt },
              { role: "user", content: answerUserPrompt },
            ],
            response_format: { type: "json_object" },
          });

          const answerResponseContent =
            answerCompletion.choices[0]?.message?.content || "";
          let answerParsedResponse;
          try {
            answerParsedResponse = JSON.parse(answerResponseContent);
          } catch (parseError) {
            console.error(
              `❌ [AUTO_GRADE] JSON parse error for answer stage question ${qIdx}:`,
              parseError
            );
            throw new Error(`JSON parse error: ${parseError}`);
          }

          stageGrading.answer = {
            score: Math.max(
              0,
              Math.min(100, Math.round(answerParsedResponse.score || 0))
            ),
            comment: answerParsedResponse.comment || "답안 평가 완료",
          };

          console.log(
            `✅ [AUTO_GRADE] Question ${qIdx} answer stage graded: ${stageGrading.answer.score}점`
          );
        } catch (error) {
          console.error(
            `❌ [AUTO_GRADE] Error grading answer stage for question ${qIdx}:`,
            error
          );
          // Continue with other stages even if one fails
        }
      }

      // Calculate overall score from stage scores
      let overallScore = 0;
      let stageCount = 0;
      if (stageGrading.chat) {
        overallScore += stageGrading.chat.score;
        stageCount++;
      }
      if (stageGrading.answer) {
        overallScore += stageGrading.answer.score;
        stageCount++;
      }

      const finalScore =
        stageCount > 0 ? Math.round(overallScore / stageCount) : 0;
      const overallComment = `채팅 단계: ${
        stageGrading.chat?.score || "N/A"
      }점, 답안 단계: ${stageGrading.answer?.score || "N/A"}점`;

      // Only add grade if at least one stage was graded
      if (Object.keys(stageGrading).length > 0) {
        grades.push({
          q_idx: qIdx,
          score: finalScore,
          comment: overallComment,
          stage_grading: stageGrading,
        });

        console.log(
          `✅ [AUTO_GRADE] Question ${qIdx} overall graded: ${finalScore}점 (stages: ${Object.keys(
            stageGrading
          ).join(", ")})`
        );
      } else {
        console.log(
          `⚠️ [AUTO_GRADE] Question ${qIdx} - no stages graded, skipping`
        );
      }
    }

    // Save all grades
    if (grades.length > 0) {
      console.log(
        `💾 [AUTO_GRADE] Saving ${grades.length} grades to database...`
      );
      const { error: insertError } = await supabase.from("grades").insert(
        grades.map((grade) => ({
          session_id: sessionId,
          q_idx: grade.q_idx,
          score: grade.score,
          comment: grade.comment,
          stage_grading: grade.stage_grading || null,
        }))
      );

      if (insertError) {
        console.error(`❌ [AUTO_GRADE] Database insert error:`, insertError);
        throw insertError;
      }
      console.log(`✅ [AUTO_GRADE] Successfully saved ${grades.length} grades`);
    } else {
      console.log(`⚠️ [AUTO_GRADE] No grades to save (grades.length = 0)`);
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Auto-grading completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Auto-graded ${grades.length} questions | Session: ${sessionId}`
    );

    return successJson({
      gradesCount: grades.length,
      grades,
    });
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Auto-grade error:", error);
    console.error(
      `❌ [ERROR] Auto-grade failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    console.error("Error stack:", (error as Error)?.stack);
    console.error("Full error:", error);

    return errorJson(
      "INTERNAL_ERROR",
      (error as Error)?.message || "Unknown error occurred",
      500,
      (error as Error)?.message
    );
  }
}
