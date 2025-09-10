import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";
import { compressData } from "@/lib/compression";

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      case "create_exam":
        return await createExam(data);
      case "update_exam":
        return await updateExam(data);
      case "submit_exam":
        return await submitExam(data);
      case "get_exam":
        return await getExam(data);
      case "get_exam_by_id":
        return await getExamById(data);
      case "get_instructor_exams":
        return await getInstructorExams();
      case "create_or_get_session":
        return await createOrGetSession(data);
      case "save_draft":
        return await saveDraft(data);
      case "save_all_drafts":
        return await saveAllDrafts(data);
      case "get_session_messages":
        return await getSessionMessages(data);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Supabase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

interface QuestionData {
  id: string;
  text: string;
  type: "multiple-choice" | "essay" | "short-answer";
  options?: string[];
  correctAnswer?: string;
  core_ability?: string;
}

async function createExam(data: {
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: QuestionData[];
  materials?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}) {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    console.log("Create exam - User role:", userRole, "User ID:", user.id);

    if (userRole !== "instructor") {
      console.log("Create exam - Access denied. User role:", userRole);
      return NextResponse.json(
        {
          error: "Instructor access required",
          details: `User role: ${userRole || "not set"}`,
          userId: user.id,
        },
        { status: 403 }
      );
    }

    // Create exam with the correct schema
    const examData = {
      title: data.title,
      code: data.code,
      description: data.description,
      duration: data.duration,
      questions: data.questions,
      materials: data.materials || [],
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    const { data: exam, error } = await supabase
      .from("exams")
      .insert([examData])
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Create exam error:", error);
    return NextResponse.json(
      {
        error: `Failed to create exam: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}

async function updateExam(data: {
  id: string;
  update: Record<string, unknown>;
}) {
  try {
    const { data: exam, error } = await supabase
      .from("exams")
      .update(data.update)
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Update exam error:", error);
    return NextResponse.json(
      { error: "Failed to update exam" },
      { status: 500 }
    );
  }
}

async function submitExam(data: {
  examId: string;
  studentId: string;
  sessionId: string;
  answers: unknown[];
  chatHistory?: any[];
  feedback?: string;
  feedbackResponses?: any[];
}) {
  try {
    // Compress the session data
    const sessionData = {
      chatHistory: data.chatHistory || [],
      answers: data.answers,
      feedback: data.feedback,
      feedbackResponses: data.feedbackResponses || [],
    };

    const compressedSessionData = compressData(sessionData);

    // Update session with compressed data
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .update({
        compressed_session_data: compressedSessionData.data,
        compression_metadata: compressedSessionData.metadata,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId)
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Store individual submissions with compressed data
    const submissionInserts = data.answers.map((answer: unknown, index: number) => {
      const answerObj = answer as Record<string, unknown>;
      const submissionData = {
        answer: answerObj.text || answer,
        feedback: data.feedback,
        studentReply: data.feedbackResponses?.[index],
      };

      const compressedSubmissionData = compressData(submissionData);

      return {
        session_id: data.sessionId,
        q_idx: index,
        answer: answerObj.text || answer,
        ai_feedback: data.feedback ? { feedback: data.feedback } : null,
        student_reply: data.feedbackResponses?.[index],
        compressed_answer_data: compressedSubmissionData.data,
        compression_metadata: compressedSubmissionData.metadata,
      };
    });

    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .insert(submissionInserts)
      .select();

    if (submissionsError) throw submissionsError;

    console.log("Exam submission compressed and stored:", {
      sessionId: data.sessionId,
      originalSize: compressedSessionData.metadata.originalSize,
      compressedSize: compressedSessionData.metadata.compressedSize,
      compressionRatio: compressedSessionData.metadata.compressionRatio,
      submissionsCount: submissions.length,
    });

    return NextResponse.json({
      session,
      submissions,
      compressionStats: compressedSessionData.metadata,
    });
  } catch (error) {
    console.error("Submit exam error:", error);
    return NextResponse.json(
      { error: "Failed to submit exam" },
      { status: 500 }
    );
  }
}

async function getExam(data: { code: string }) {
  try {
    const { data: exam, error } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.code)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Get exam error:", error);
    return NextResponse.json({ error: "Failed to get exam" }, { status: 500 });
  }
}

async function getExamById(data: { id: string }) {
  try {
    console.log("API: getExamById called with data:", data);

    // Get current user
    const user = await currentUser();
    if (!user) {
      if (process.env.NODE_ENV === "development") {
        console.log("API: No user found");
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (process.env.NODE_ENV === "development") {
      console.log("API: User found:", user.id);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (process.env.NODE_ENV === "development") {
      console.log("API: User role:", userRole);
    }

    if (userRole !== "instructor") {
      if (process.env.NODE_ENV === "development") {
        console.log("API: User is not instructor");
      }
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        "API: Querying exam with ID:",
        data.id,
        "for instructor:",
        user.id
      );
    }

    const { data: exam, error } = await supabase
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, status, instructor_id, created_at, updated_at"
      )
      .eq("id", data.id)
      .eq("instructor_id", user.id) // Only allow instructors to view their own exams
      .single();

    if (error) {
      console.error("API: Database error:", error);
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      }
      throw error;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("API: Exam found:", exam);
    }
    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Get exam by ID error:", error);
    return NextResponse.json({ error: "Failed to get exam" }, { status: 500 });
  }
}

async function getInstructorExams() {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const { data: exams, error } = await supabase
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, status, instructor_id, created_at, updated_at"
      )
      .eq("instructor_id", user.id) // Clerk user ID
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ exams });
  } catch (error) {
    console.error("Get instructor exams error:", error);
    return NextResponse.json({ error: "Failed to get exams" }, { status: 500 });
  }
}

async function createOrGetSession(data: { examId: string; studentId: string }) {
  try {
    if (process.env.NODE_ENV === "development") {
      console.log("Creating or getting session for:", data);
    }

    // Check if session already exists
    const { data: existingSessions, error: checkError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", data.examId)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

    console.log("Session check result:", { existingSessions, checkError });

    if (checkError) {
      console.error("Session check error:", checkError);
      throw checkError;
    }

    // Use the most recent session if multiple exist
    const existingSession =
      existingSessions && existingSessions.length > 0
        ? existingSessions[0]
        : null;

    if (existingSession) {
      // Get existing messages for this session
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      return NextResponse.json({
        session: existingSession,
        messages: messages || [],
      });
    }

    // Create new session
    const { data: newSession, error: createError } = await supabase
      .from("sessions")
      .insert([
        {
          exam_id: data.examId,
          student_id: data.studentId,
          used_clarifications: 0,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (createError) throw createError;

    return NextResponse.json({
      session: newSession,
      messages: [],
    });
  } catch (error) {
    console.error("Create or get session error:", error);
    return NextResponse.json(
      { error: "Failed to create or get session" },
      { status: 500 }
    );
  }
}

async function saveDraft(data: {
  sessionId: string;
  questionId: string;
  answer: string;
}) {
  try {
    // Check if submission already exists
    const { data: existingSubmission, error: checkError } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", data.sessionId)
      .eq("q_idx", data.questionId)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingSubmission) {
      // Update existing submission
      const { data: updatedSubmission, error: updateError } = await supabase
        .from("submissions")
        .update({
          answer: data.answer,
          created_at: new Date().toISOString(),
        })
        .eq("id", existingSubmission.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json({ submission: updatedSubmission });
    } else {
      // Create new submission
      const { data: newSubmission, error: createError } = await supabase
        .from("submissions")
        .insert([
          {
            session_id: data.sessionId,
            q_idx: data.questionId,
            answer: data.answer,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (createError) throw createError;
      return NextResponse.json({ submission: newSubmission });
    }
  } catch (error) {
    console.error("Save draft error:", error);
    return NextResponse.json(
      { error: "Failed to save draft" },
      { status: 500 }
    );
  }
}

async function saveAllDrafts(data: {
  sessionId: string;
  drafts: Array<{ questionId: string; text: string }>;
}) {
  try {
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

    return NextResponse.json({ submissions: results });
  } catch (error) {
    console.error("Save all drafts error:", error);
    return NextResponse.json(
      { error: "Failed to save all drafts" },
      { status: 500 }
    );
  }
}

async function getSessionMessages(data: { sessionId: string }) {
  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    console.error("Get session messages error:", error);
    return NextResponse.json(
      { error: "Failed to get session messages" },
      { status: 500 }
    );
  }
}
