import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { openai, AI_MODEL } from "@/lib/openai";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

// Helper function to get user info from Clerk
async function getUserInfo(clerkUserId: string): Promise<{
  name: string;
  email: string;
} | null> {
  try {
    const user = await clerk.users.getUser(clerkUserId);
    
    // Get user name from firstName/lastName or fullName
    let name = "";
    if (user.firstName && user.lastName) {
      name = `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      name = user.firstName;
    } else if (user.lastName) {
      name = user.lastName;
    } else if (user.fullName) {
      name = user.fullName;
    } else {
      // Fallback to email or ID
      name = user.emailAddresses[0]?.emailAddress || `Student ${clerkUserId.slice(0, 8)}`;
    }
    
    const email = user.emailAddresses[0]?.emailAddress || `${clerkUserId}@example.com`;
    
    return {
      name,
      email,
    };
  } catch (error) {
    console.error("Error fetching user info from Clerk:", error);
    // Fallback to placeholder
    return {
      name: `Student ${clerkUserId.slice(0, 8)}`,
      email: `${clerkUserId}@example.com`,
    };
  }
}

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("✅ User authenticated:", user.id);

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get session data first
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.log("❌ Session not found:", sessionError);
      return NextResponse.json(
        {
          error: "Session not found",
          details: sessionError?.message,
          sessionId,
        },
        { status: 404 }
      );
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
      return NextResponse.json(
        {
          error: "Exam not found",
          details: examError?.message,
        },
        { status: 404 }
      );
    }

    // Normalize questions format (text -> prompt, core_ability -> ai_context)
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        idx: q.idx,
        type: q.type,
        prompt: q.prompt || q.text, // Support both field names
        ai_context: q.ai_context || q.core_ability, // Support both field names
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
        compressed_feedback_data,
        compression_metadata,
        created_at
      `
      )
      .eq("session_id", sessionId);

    if (submissionsError) {
      console.log("⚠️ Error fetching submissions:", submissionsError);
    } else {
      console.log("📤 Submissions fetched:", {
        count: submissions?.length || 0,
        submissions: submissions,
      });
    }

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
        compression_metadata,
        created_at
      `
      )
      .eq("session_id", sessionId);

    if (messagesError) {
      console.log("⚠️ Error fetching messages:", messagesError);
    } else {
      console.log("💬 Messages fetched:", {
        count: messages?.length || 0,
        messages: messages,
      });
    }

    // Get grades
    const { data: grades, error: gradesError } = await supabase
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
      .eq("session_id", sessionId);

    if (gradesError) {
      console.log("⚠️ Error fetching grades:", gradesError);
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      console.log("❌ Instructor mismatch:", {
        examInstructorId: exam.instructor_id,
        userId: user.id,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log("✅ Instructor verified");

    // Get student info
    const studentInfo = await getUserInfo(session.student_id);

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
      },
      exam: exam,
      student: studentInfo || {
        name: `Student ${session.student_id.slice(0, 8)}`,
        email: "N/A",
      },
      submissions: submissionsByQuestion,
      messages: messagesByQuestion,
      grades: gradesByQuestion,
      overallScore,
      aiSummary: session.ai_summary || null,
    };

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

    return NextResponse.json(responseData);
  } catch (error) {
    const requestDuration = Date.now() - requestStartTime;
    console.error("Get session for grading error:", error);
    console.error(
      `❌ [ERROR] Session grading GET failed after ${requestDuration}ms | Error: ${
        (error as Error)?.message
      }`
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
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
    const user = await currentUser();
    const body = await request.json();
    const { questionIdx, score, comment, stageGrading } = body;

    console.log(
      `📊 [GRADING] Grade submission | Session: ${sessionId} | Question: ${questionIdx} | Score: ${score}`
    );

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get session to verify instructor owns the exam
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get exam to check instructor
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    return NextResponse.json({
      success: true,
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get exam with rubric
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, questions, rubric, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        return NextResponse.json({
          success: true,
          message: "Already graded",
          skipped: true,
        });
      }
    } else {
      // Delete existing grades if force regrade
      await supabase
        .from("grades")
        .delete()
        .eq("session_id", sessionId);
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
        `📦 [AUTO_GRADE] Processed submissions for q_idx: ${Object.keys(submissionsByQuestion).join(", ")}`
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
              (decompressData(message.compressed_content as string) as string) ||
              content;
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
            ai_context: q.ai_context || q.core_ability,
          }))
        : []
      : [];

    console.log(
      `📝 [AUTO_GRADE] Questions: ${questions.length}, Submissions: ${submissions?.length || 0}`
    );

    // Auto-grade each question
    const grades: Array<{
      q_idx: number;
      score: number;
      comment: string;
      stage_grading?: {
        chat?: { score: number; comment: string };
        answer?: { score: number; comment: string };
        feedback?: { score: number; comment: string };
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
        `🔍 [AUTO_GRADE] Processing question ${qIdx}: submission=${!!submission}, messages=${questionMessages.length}, answer=${submission?.answer ? "yes" : "no"}`
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
        feedback?: { score: number; comment: string };
      } = {};

      // 1. Chat stage grading
      if (questionMessages.length > 0) {
        try {
          const chatSystemPrompt = `당신은 전문 평가위원입니다. 학생과 AI의 대화 과정을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생이 AI와의 대화에서 보여준 질문의 질, 문제 이해도, 개념 파악 수준을 평가하세요.
3. AI의 답변을 통해 학생이 얼마나 효과적으로 학습하고 개선했는지 평가하세요.
4. 점수는 0-100점 사이의 정수로 부여하세요.
5. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "대화 과정에서 보여준 학습 태도와 이해도를 평가한 내용을 한국어로 작성하세요."
}`;

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
          const answerSystemPrompt = `당신은 전문 평가위원입니다. 학생의 최종 답안을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생의 답안이 루브릭의 각 평가 영역을 얼마나 충족하는지 평가하세요.
3. 답안의 완성도, 논리성, 정확성을 종합적으로 평가하세요.
4. 점수는 0-100점 사이의 정수로 부여하세요.
5. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "답안의 강점과 개선점을 루브릭 기준에 따라 평가한 내용을 한국어로 작성하세요."
}`;

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

      // 3. Feedback stage grading (only if student replied)
      if (submission.ai_feedback && submission.student_reply) {
        try {
          const feedbackSystemPrompt = `당신은 전문 평가위원입니다. AI 피드백에 대한 학생의 반박 답변을 루브릭 기준에 따라 평가하고 점수를 부여합니다.

${rubricText}

평가 지침:
1. 제공된 루브릭의 각 평가 영역과 기준을 정확히 검토하세요.
2. 학생이 AI 피드백을 제대로 이해하고 반박했는지 평가하세요.
3. 학생의 반박 내용이 논리적이고 타당한지 평가하세요.
4. 피드백을 통해 학생이 얼마나 성장했는지 평가하세요.
5. 점수는 0-100점 사이의 정수로 부여하세요.
6. 구체적이고 건설적인 피드백을 제공하세요.

응답 형식 (JSON):
{
  "score": 75,
  "comment": "피드백에 대한 학생의 반박 답변을 루브릭 기준에 따라 평가한 내용을 한국어로 작성하세요."
}`;

          const feedbackUserPrompt = `다음 정보를 바탕으로 피드백 대응 단계를 평가해주세요:

**문제:**
${question.prompt || ""}

${question.ai_context ? `**문제 컨텍스트:**\n${question.ai_context}\n` : ""}

**학생의 최종 답안:**
${submission.answer || "답안이 없습니다."}

**AI 피드백:**
${submission.ai_feedback}

**학생의 반박 답변:**
${submission.student_reply}

위 정보를 바탕으로 루브릭 기준에 따라 피드백 대응 단계의 점수와 피드백을 제공해주세요.`;

          const feedbackCompletion = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "system", content: feedbackSystemPrompt },
              { role: "user", content: feedbackUserPrompt },
            ],
            response_format: { type: "json_object" },
          });

          const feedbackResponseContent =
            feedbackCompletion.choices[0]?.message?.content || "";
          let feedbackParsedResponse;
          try {
            feedbackParsedResponse = JSON.parse(feedbackResponseContent);
          } catch (parseError) {
            console.error(
              `❌ [AUTO_GRADE] JSON parse error for feedback stage question ${qIdx}:`,
              parseError
            );
            throw new Error(`JSON parse error: ${parseError}`);
          }

          stageGrading.feedback = {
            score: Math.max(
              0,
              Math.min(100, Math.round(feedbackParsedResponse.score || 0))
            ),
            comment: feedbackParsedResponse.comment || "피드백 대응 평가 완료",
          };

          console.log(
            `✅ [AUTO_GRADE] Question ${qIdx} feedback stage graded: ${stageGrading.feedback.score}점`
          );
        } catch (error) {
          console.error(
            `❌ [AUTO_GRADE] Error grading feedback stage for question ${qIdx}:`,
            error
          );
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
      if (stageGrading.feedback) {
        overallScore += stageGrading.feedback.score;
        stageCount++;
      }

      const finalScore = stageCount > 0 ? Math.round(overallScore / stageCount) : 0;
      const overallComment = `채팅 단계: ${stageGrading.chat?.score || "N/A"}점, 답안 단계: ${stageGrading.answer?.score || "N/A"}점, 피드백 단계: ${stageGrading.feedback?.score || "N/A"}점`;

      // Only add grade if at least one stage was graded
      if (Object.keys(stageGrading).length > 0) {
        grades.push({
          q_idx: qIdx,
          score: finalScore,
          comment: overallComment,
          stage_grading: stageGrading,
        });

        console.log(
          `✅ [AUTO_GRADE] Question ${qIdx} overall graded: ${finalScore}점 (stages: ${Object.keys(stageGrading).join(", ")})`
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
      const { error: insertError } = await supabase
        .from("grades")
        .insert(
          grades.map((grade) => ({
            session_id: sessionId,
            q_idx: grade.q_idx,
            score: grade.score,
            comment: grade.comment,
            stage_grading: grade.stage_grading || null,
          }))
        );

      if (insertError) {
        console.error(
          `❌ [AUTO_GRADE] Database insert error:`,
          insertError
        );
        throw insertError;
      }
      console.log(`✅ [AUTO_GRADE] Successfully saved ${grades.length} grades`);
    } else {
      console.log(
        `⚠️ [AUTO_GRADE] No grades to save (grades.length = 0)`
      );
    }

    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `⏱️  [PERFORMANCE] Auto-grading completed in ${requestDuration}ms`
    );
    console.log(
      `✅ [SUCCESS] Auto-graded ${grades.length} questions | Session: ${sessionId}`
    );

    return NextResponse.json({
      success: true,
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
    
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: (error as Error)?.message,
        message: (error as Error)?.message || "Unknown error occurred"
      },
      { status: 500 }
    );
  }
}
