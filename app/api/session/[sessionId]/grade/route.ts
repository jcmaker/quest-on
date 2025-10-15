import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ClerkUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: Array<{ emailAddress: string }>;
}

// Helper function to get user info from Clerk
async function getUserInfo(clerkUserId: string): Promise<{
  name: string;
  email: string;
} | null> {
  try {
    // In a real app, you would fetch this from Clerk API
    // For now, we'll return a placeholder
    return {
      name: `Student ${clerkUserId.slice(0, 8)}`,
      email: `${clerkUserId}@example.com`,
    };
  } catch (error) {
    console.error("Error fetching user info:", error);
    return null;
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
      .select("id, title, code, instructor_id, questions")
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
    const { questionIdx, score, comment } = body;

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
