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
      case "save_draft_answers":
        return await saveDraftAnswers(data);
      case "get_session_submissions":
        return await getSessionSubmissions(data);
      case "get_session_messages":
        return await getSessionMessages(data);
      case "create_folder":
        return await createFolder(data);
      case "get_folder_contents":
        return await getFolderContents(data);
      case "get_breadcrumb":
        return await getBreadcrumb(data);
      case "move_node":
        return await moveNode(data);
      case "update_node":
        return await updateNode(data);
      case "delete_node":
        return await deleteNode(data);
      case "get_instructor_drive":
        return await getInstructorDrive();
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
  rubric?: {
    evaluationArea: string;
    detailedCriteria: string;
    weight: number;
  }[];
  status: string;
  created_at: string;
  updated_at: string;
  parent_folder_id?: string | null;
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
      rubric: data.rubric || [],
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

    // Create exam node in exam_nodes table
    // parent_id는 data에서 받거나 null (루트에 배치)
    const parentId = data.parent_folder_id || null;

    // Get the maximum sort_order for this parent folder
    let sortQuery = supabase
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      sortQuery = sortQuery.is("parent_id", null);
    } else {
      sortQuery = sortQuery.eq("parent_id", parentId);
    }

    const { data: existingNodes } = await sortQuery
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingNodes && existingNodes.length > 0
        ? existingNodes[0].sort_order + 1
        : 0;

    // Create exam node
    const { data: examNode, error: nodeError } = await supabase
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: parentId,
          kind: "exam",
          name: data.title,
          exam_id: exam.id,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (nodeError) {
      console.error("Failed to create exam node:", nodeError);
      // Exam is created but node creation failed - this is not critical
      // but we should log it
    }

    return NextResponse.json({ exam, examNode });
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
  chatHistory?: unknown[];
  feedback?: string;
  feedbackResponses?: unknown[];
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
    const submissionInserts = data.answers.map(
      (answer: unknown, index: number) => {
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
      }
    );

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

    // Transform exams to include questionsCount and student_count
    const examsWithCounts = await Promise.all(
      (exams || []).map(async (exam) => {
        // Calculate questionsCount from questions array
        const questionsCount = Array.isArray(exam.questions)
          ? exam.questions.length
          : 0;

        // Get student count by counting distinct student_ids for this exam
        const { data: sessions, error: countError } = await supabase
          .from("sessions")
          .select("student_id")
          .eq("exam_id", exam.id);

        // Count distinct student_ids
        const student_count = countError
          ? 0
          : new Set((sessions || []).map((s) => s.student_id)).size;

        return {
          ...exam,
          questionsCount,
          student_count,
        };
      })
    );

    return NextResponse.json({ exams: examsWithCounts });
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

      // 프론트엔드가 기대하는 형식으로 변환 (qIdx 포함)
      const formattedMessages = (messages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));

      console.log(
        "📨 Loading existing messages:",
        formattedMessages.length,
        "messages"
      );

      return NextResponse.json({
        session: existingSession,
        messages: formattedMessages,
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

async function saveDraftAnswers(data: {
  sessionId: string;
  answers: Array<{ questionId: string; text: string }>;
}) {
  try {
    const results = [];

    for (const answer of data.answers) {
      if (answer.text.trim()) {
        // Find the question index from the questionId
        const { data: session } = await supabase
          .from("sessions")
          .select("exam_id")
          .eq("id", data.sessionId)
          .single();

        if (session) {
          const { data: exam } = await supabase
            .from("exams")
            .select("questions")
            .eq("id", session.exam_id)
            .single();

          if (exam && exam.questions) {
            const questions = exam.questions as Array<{ id: string }>;
            const questionIndex = questions.findIndex(
              (q) => q.id === answer.questionId
            );

            if (questionIndex !== -1) {
              const result = await saveDraft({
                sessionId: data.sessionId,
                questionId: questionIndex.toString(),
                answer: answer.text,
              });

              if (result.status === 200) {
                const resultData = await result.json();
                results.push(resultData.submission);
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ submissions: results });
  } catch (error) {
    console.error("Save draft answers error:", error);
    return NextResponse.json(
      { error: "Failed to save draft answers" },
      { status: 500 }
    );
  }
}

async function getSessionSubmissions(data: { sessionId: string }) {
  try {
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("q_idx", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ submissions: submissions || [] });
  } catch (error) {
    console.error("Get session submissions error:", error);
    return NextResponse.json(
      { error: "Failed to get session submissions" },
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

// ========== Exam Nodes (Folder/Drive) Functions ==========

async function createFolder(data: { name: string; parent_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // Get the maximum sort_order for this parent folder
    const parentId = data.parent_id || null;
    let sortQuery = supabase
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      sortQuery = sortQuery.is("parent_id", null);
    } else {
      sortQuery = sortQuery.eq("parent_id", parentId);
    }

    const { data: existingNodes } = await sortQuery
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder =
      existingNodes && existingNodes.length > 0
        ? existingNodes[0].sort_order + 1
        : 0;

    const { data: folder, error } = await supabase
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: data.parent_id || null,
          kind: "folder",
          name: data.name,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}

async function getFolderContents(data: { folder_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const parentId = data.folder_id || null;

    // Build query
    let query = supabase
      .from("exam_nodes")
      .select(
        `
        *,
        exams (
          id,
          title,
          code,
          description,
          duration,
          status,
          created_at,
          updated_at
        )
      `
      )
      .eq("instructor_id", user.id);

    // Handle null parent_id (root level)
    if (parentId === null) {
      query = query.is("parent_id", null);
    } else {
      query = query.eq("parent_id", parentId);
    }

    // Apply ordering
    const { data: nodes, error } = await query
      .order("kind", { ascending: false }) // folders first
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    return NextResponse.json({ nodes: nodes || [] });
  } catch (error) {
    console.error("Get folder contents error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to get folder contents",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

async function getBreadcrumb(data: { folder_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use recursive CTE to get all parent folders
    const { data: rpcData, error } = await supabase.rpc("get_breadcrumb_path", {
      folder_id: data.folder_id,
    });

    if (error) {
      // If RPC doesn't exist, use a simpler approach with multiple queries
      const breadcrumb: Array<{ id: string; name: string }> = [];
      let currentId: string | null = data.folder_id;

      while (currentId) {
        const { data: node, error: nodeError } = await supabase
          .from("exam_nodes")
          .select("id, name, parent_id")
          .eq("id", currentId)
          .eq("instructor_id", user.id)
          .single();

        if (nodeError || !node) break;

        breadcrumb.unshift({ id: node.id, name: node.name });
        currentId = node.parent_id as string | null;
      }

      return NextResponse.json({ breadcrumb });
    }

    return NextResponse.json({ breadcrumb: rpcData || [] });
  } catch (error) {
    console.error("Get breadcrumb error:", error);
    return NextResponse.json(
      { error: "Failed to get breadcrumb" },
      { status: 500 }
    );
  }
}

async function moveNode(data: {
  node_id: string;
  new_parent_id?: string | null;
  new_sort_order?: number;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.new_parent_id !== undefined) {
      updateData.parent_id = data.new_parent_id;
    }
    if (data.new_sort_order !== undefined) {
      updateData.sort_order = data.new_sort_order;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ node });
  } catch (error) {
    console.error("Move node error:", error);
    return NextResponse.json({ error: "Failed to move node" }, { status: 500 });
  }
}

async function updateNode(data: { node_id: string; name?: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    const { data: node, error } = await supabase
      .from("exam_nodes")
      .update(updateData)
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) throw error;

    // If this is an exam node, also update the exam title
    if (node.kind === "exam" && node.exam_id && data.name) {
      await supabase
        .from("exams")
        .update({ title: data.name })
        .eq("id", node.exam_id)
        .eq("instructor_id", user.id);
    }

    return NextResponse.json({ node });
  } catch (error) {
    console.error("Update node error:", error);
    return NextResponse.json(
      { error: "Failed to update node" },
      { status: 500 }
    );
  }
}

async function deleteNode(data: { node_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // Get the node first to check if it's a folder
    const { data: node, error: fetchError } = await supabase
      .from("exam_nodes")
      .select("kind, exam_id")
      .eq("id", data.node_id)
      .eq("instructor_id", user.id)
      .single();

    if (fetchError) throw fetchError;

    // If it's a folder, check if it has children
    if (node.kind === "folder") {
      const { data: children, error: childrenError } = await supabase
        .from("exam_nodes")
        .select("id")
        .eq("parent_id", data.node_id)
        .eq("instructor_id", user.id);

      if (childrenError) throw childrenError;

      if (children && children.length > 0) {
        return NextResponse.json(
          { error: "Cannot delete folder with contents" },
          { status: 400 }
        );
      }
    }

    // Delete the node (CASCADE will handle exam deletion if needed)
    const { error: deleteError } = await supabase
      .from("exam_nodes")
      .delete()
      .eq("id", data.node_id)
      .eq("instructor_id", user.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete node error:", error);
    return NextResponse.json(
      { error: "Failed to delete node" },
      { status: 500 }
    );
  }
}

async function getInstructorDrive() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // Get root level nodes (parent_id is null)
    return await getFolderContents({ folder_id: null });
  } catch (error) {
    console.error("Get instructor drive error:", error);
    return NextResponse.json(
      { error: "Failed to get instructor drive" },
      { status: 500 }
    );
  }
}
