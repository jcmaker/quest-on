import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";

// Initialize Supabase client
const supabase = getSupabaseServer();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const invalidId = validateUUID(sessionId, "sessionId");
    if (invalidId) return invalidId;

    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    // Check if student owns this session
    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Forbidden", 403);
    }

    // Check if session is submitted
    if (!session.submitted_at) {
      return errorJson("SESSION_NOT_SUBMITTED", "Session not submitted yet", 400);
    }

    // Get exam data
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, code, description, duration, questions")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // Normalize questions format
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => ({
        id: q.id,
        idx: q.idx,
        type: q.type,
        prompt: q.prompt || q.text,
        ai_context: q.ai_context,
      }));
    }

    // Get submissions
    const { data: submissions, error: submissionsError } = await supabase
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
      .eq("session_id", sessionId)
      .order("q_idx", { ascending: true });

    if (submissionsError) {
      logError("Error fetching submissions", submissionsError);
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
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      logError("Error fetching messages", messagesError);
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
      .eq("session_id", sessionId)
      .order("q_idx", { ascending: true });

    if (gradesError) {
      logError("Error fetching grades", gradesError);
    }

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
        // Decompression failed, continue with null
      }
    }

    // Organize submissions by question index
    const submissionsByQuestion: Record<
      number,
      {
        id: string;
        q_idx: number;
        answer: string;
        created_at: string;
      }
    > = {};

    if (submissions) {
      submissions.forEach((submission) => {
        let answer = submission.answer;

        // Decompress if needed
        if (submission.compressed_answer_data) {
          try {
            const decompressed = decompressData(
              submission.compressed_answer_data
            );
            if (decompressed && typeof decompressed === "object") {
              const decompressedObj = decompressed as Record<string, unknown>;
              answer =
                (typeof decompressedObj.answer === "string"
                  ? decompressedObj.answer
                  : answer) || answer;
            }
          } catch (error) {
            // Decompression failed, continue with original
          }
        }

        submissionsByQuestion[submission.q_idx] = {
          id: submission.id,
          q_idx: submission.q_idx,
          answer: typeof answer === "string" ? answer : JSON.stringify(answer),
          created_at: submission.created_at,
        };
      });
    }

    // Organize messages by question index
    const messagesByQuestion: Record<
      number,
      Array<Record<string, unknown>>
    > = {};

    if (messages) {
      messages.forEach((message) => {
        let content = message.content;

        // Decompress if needed
        if (message.compressed_content) {
          try {
            content = decompressData(message.compressed_content);
          } catch (error) {
            // Decompression failed, continue with original
          }
        }

        const qIdx = message.q_idx || 0;
        if (!messagesByQuestion[qIdx]) {
          messagesByQuestion[qIdx] = [];
        }

        messagesByQuestion[qIdx].push({
          role: message.role,
          content:
            typeof content === "string" ? content : JSON.stringify(content),
          created_at: message.created_at,
        });
      });
    }

    // Organize grades by question index
    const gradesByQuestion: Record<
      number,
      { id: string; q_idx: number; score: number; comment?: string }
    > = {};

    if (grades) {
      grades.forEach((grade) => {
        gradesByQuestion[grade.q_idx] = {
          id: grade.id,
          q_idx: grade.q_idx,
          score: grade.score,
          comment: grade.comment || undefined,
        };
      });
    }

    // Calculate overall score
    let overallScore = null;
    if (grades && grades.length > 0) {
      const totalScore = grades.reduce(
        (sum, grade) => sum + (grade.score || 0),
        0
      );
      const questionCount = exam.questions?.length || 1;
      overallScore = Math.round(totalScore / questionCount);
    }

    return successJson({
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
      submissions: submissionsByQuestion,
      messages: messagesByQuestion,
      grades: gradesByQuestion,
      overallScore,
      aiSummary: session.ai_summary || null,
    });
  } catch (error) {
    return errorJson("FETCH_REPORT_FAILED", "Failed to get report", 500);
  }
}
