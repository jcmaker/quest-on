import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";
import { compressData } from "@/lib/compression";

// Initialize Supabase client with service role key for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables:", {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  });
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server configuration error: Missing Supabase credentials" },
      { status: 500 }
    );
  }

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
      case "init_exam_session": // New optimized action
        return await initExamSession(data);
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
      case "session_heartbeat":
        return await sessionHeartbeat(data);
      case "deactivate_session":
        return await deactivateSession(data);
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
  duration: number;
  questions: QuestionData[];
  materials?: string[];
  materials_text?: Array<{
    url: string;
    text: string;
    fileName: string;
  }>;
  rubric?: {
    evaluationArea: string;
    detailedCriteria: string;
  }[];
  rubric_public?: boolean;
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
      description: null, // description 필드는 nullable이므로 null로 설정
      duration: data.duration,
      questions: data.questions,
      materials: data.materials || [],
      materials_text: data.materials_text || [], // 추출된 텍스트 저장
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    console.log("[api] Creating exam with materials_text:", {
      materialsCount: examData.materials.length,
      materialsTextCount: examData.materials_text.length,
      materialsTextPreview: Array.isArray(examData.materials_text)
        ? examData.materials_text.map((m: unknown) => {
            const mt = m as { fileName?: string; text?: string };
            return {
              fileName: mt?.fileName || "unknown",
              textLength: mt?.text?.length || 0,
            };
          })
        : "not an array",
    });

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

    // Update session with compressed data and deactivate
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .update({
        compressed_session_data: compressedSessionData.data,
        compression_metadata: compressedSessionData.metadata,
        submitted_at: new Date().toISOString(),
        is_active: false, // Deactivate session on submission
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
        "id, title, code, description, duration, questions, materials, rubric, rubric_public, status, instructor_id, created_at, updated_at"
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

// Optimized function to fetch exam AND session in one go
async function initExamSession(data: {
  examCode: string;
  studentId: string;
  deviceFingerprint?: string;
}) {
  try {
    console.log("[INIT_EXAM_SESSION] Starting session init:", {
      examCode: data.examCode,
      studentId: data.studentId,
      hasDeviceFingerprint: !!data.deviceFingerprint,
    });

    // 1. Fetch Exam by Code
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // 2. Check for active session (prevent concurrent access)
    const { data: activeSessions, error: activeCheckError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", data.studentId)
      .eq("is_active", true)
      .is("submitted_at", null);

    if (activeCheckError) throw activeCheckError;

    console.log(
      "[INIT_EXAM_SESSION] Active sessions found:",
      activeSessions?.length || 0
    );

    // If there's an active session and it's not from the same device, block access
    if (activeSessions && activeSessions.length > 0) {
      const activeSession = activeSessions[0];
      console.log("[INIT_EXAM_SESSION] Active session details:", {
        sessionId: activeSession.id,
        deviceFingerprint: activeSession.device_fingerprint,
        incomingFingerprint: data.deviceFingerprint,
        lastHeartbeat: activeSession.last_heartbeat_at,
      });

      // Check if it's from the same device (if device fingerprint is provided)
      if (data.deviceFingerprint && activeSession.device_fingerprint) {
        if (activeSession.device_fingerprint !== data.deviceFingerprint) {
          // Different device trying to access - block it
          console.log(
            "[INIT_EXAM_SESSION] ❌ BLOCKED: Different device detected"
          );
          return NextResponse.json(
            {
              error: "CONCURRENT_ACCESS_BLOCKED",
              message:
                "이미 다른 기기에서 시험이 진행 중입니다. 동시 접속은 불가능합니다.",
              activeSessionId: activeSession.id,
            },
            { status: 409 }
          );
        }
        // Same device - allow reconnection
        console.log(
          "[INIT_EXAM_SESSION] ✅ Same device - allowing reconnection"
        );
      } else {
        // No device fingerprint, but active session exists - block for safety
        // Check if last heartbeat was recent (within 5 minutes)
        const lastHeartbeat = activeSession.last_heartbeat_at
          ? new Date(activeSession.last_heartbeat_at).getTime()
          : 0;
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now - lastHeartbeat < fiveMinutes) {
          // Active session exists and is recent - block
          console.log(
            "[INIT_EXAM_SESSION] ❌ BLOCKED: Recent active session without device fingerprint"
          );
          return NextResponse.json(
            {
              error: "CONCURRENT_ACCESS_BLOCKED",
              message:
                "이미 다른 기기에서 시험이 진행 중입니다. 동시 접속은 불가능합니다.",
              activeSessionId: activeSession.id,
            },
            { status: 409 }
          );
        } else {
          // Last heartbeat is old, consider session stale - deactivate it
          console.log(
            "[INIT_EXAM_SESSION] ⚠️ Stale session detected - deactivating"
          );
          await supabase
            .from("sessions")
            .update({ is_active: false })
            .eq("id", activeSession.id);
        }
      }
    }

    // 3. Get all existing sessions (for finding the most recent one)
    const { data: existingSessions, error: checkError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

    if (checkError) throw checkError;

    let existingSession: (typeof existingSessions)[0] | null =
      existingSessions && existingSessions.length > 0
        ? existingSessions[0]
        : null;

    console.log(
      "[INIT_EXAM_SESSION] Existing session found:",
      !!existingSession
    );

    // IMPORTANT: If existing session exists but has different device fingerprint,
    // don't reuse it - this prevents device switching
    if (existingSession && !existingSession.submitted_at) {
      if (
        data.deviceFingerprint &&
        existingSession.device_fingerprint &&
        existingSession.device_fingerprint !== data.deviceFingerprint
      ) {
        console.log(
          "[INIT_EXAM_SESSION] ⚠️ Existing session from different device - not reusing"
        );
        // Don't use this session, will create a new one
        // But first, deactivate the old one to prevent confusion
        await supabase
          .from("sessions")
          .update({ is_active: false })
          .eq("id", existingSession.id);
        existingSession = null;
      }
    }

    let session = existingSession;
    let messages: Array<{
      type: "user" | "assistant";
      message: string;
      timestamp: string;
      qIdx: number;
    }> = [];
    const now = new Date().toISOString();

    if (existingSession && !existingSession.submitted_at) {
      // Activate existing session (only if same device or no device info)
      console.log(
        "[INIT_EXAM_SESSION] Activating existing session:",
        existingSession.id
      );
      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update({
          is_active: true,
          last_heartbeat_at: now,
          device_fingerprint:
            data.deviceFingerprint || existingSession.device_fingerprint,
        })
        .eq("id", existingSession.id)
        .select()
        .single();

      if (updateError) throw updateError;
      session = updatedSession;

      // Get messages for existing session
      const { data: sessionMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));
    } else if (existingSession && existingSession.submitted_at) {
      // Session is submitted, but we should still load messages for viewing
      console.log(
        "[INIT_EXAM_SESSION] Loading messages from submitted session:",
        existingSession.id
      );
      session = existingSession;

      // Get messages for submitted session (read-only)
      const { data: sessionMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));

      console.log(
        "[INIT_EXAM_SESSION] Loaded",
        messages.length,
        "messages from submitted session"
      );
    } else {
      // Create new session and activate it
      console.log("[INIT_EXAM_SESSION] Creating new session");
      const { data: newSession, error: createError } = await supabase
        .from("sessions")
        .insert([
          {
            exam_id: exam.id,
            student_id: data.studentId,
            used_clarifications: 0,
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint: data.deviceFingerprint || null,
            created_at: now,
          },
        ])
        .select()
        .single();

      if (createError) throw createError;
      session = newSession;
      console.log("[INIT_EXAM_SESSION] ✅ New session created:", newSession.id);
    }

    return NextResponse.json({ exam, session, messages });
  } catch (error) {
    console.error("[INIT_EXAM_SESSION] ❌ Error:", error);
    return NextResponse.json(
      { error: "Failed to initialize exam session" },
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

    const now = new Date().toISOString();

    if (existingSubmission) {
      // 답안이 변경된 경우에만 히스토리 업데이트
      const answerChanged = existingSubmission.answer !== data.answer;

      // 기존 히스토리 가져오기
      let answerHistory: Array<{ text: string; timestamp: string }> = [];
      if (existingSubmission.answer_history) {
        try {
          answerHistory = Array.isArray(existingSubmission.answer_history)
            ? existingSubmission.answer_history
            : [];
        } catch (e) {
          answerHistory = [];
        }
      }

      // 답안이 변경된 경우 히스토리에 추가
      if (answerChanged && existingSubmission.answer) {
        answerHistory.push({
          text: existingSubmission.answer,
          timestamp:
            existingSubmission.updated_at || existingSubmission.created_at,
        });
      }

      // Update existing submission
      const { data: updatedSubmission, error: updateError } = await supabase
        .from("submissions")
        .update({
          answer: data.answer,
          updated_at: now,
          answer_history: answerHistory.length > 0 ? answerHistory : null,
          edit_count: answerChanged
            ? (existingSubmission.edit_count || 0) + 1
            : existingSubmission.edit_count || 0,
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
            created_at: now,
            updated_at: now,
            edit_count: 0,
            answer_history: [],
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
    console.log("[api] getFolderContents called:", {
      folder_id: parentId,
      userId: user.id,
    });

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

    // Apply ordering - 최신순으로 정렬
    const { data: nodes, error } = await query.order("updated_at", {
      ascending: false,
    }); // 최근 수정된 것이 먼저

    if (error) {
      console.error("[api] Supabase query error in getFolderContents:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        folder_id: parentId,
        userId: user.id,
      });
      throw error;
    }

    console.log("[api] getFolderContents query successful:", {
      nodesCount: nodes?.length || 0,
      folder_id: parentId,
    });

    let nodesWithCounts = nodes || [];

    const examNodes = nodesWithCounts.filter(
      (node) => node.kind === "exam" && node.exam_id
    );

    if (examNodes.length > 0) {
      const examIds = examNodes.map((node) => node.exam_id);
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("exam_id, student_id")
        .in("exam_id", examIds as string[]);

      if (sessionsError) {
        console.error("Session count query error:", sessionsError);
      } else if (sessionsData) {
        const studentCountMap = sessionsData.reduce<
          Record<string, Set<string>>
        >((acc, session) => {
          if (!session.exam_id || !session.student_id) return acc;
          if (!acc[session.exam_id]) {
            acc[session.exam_id] = new Set();
          }
          acc[session.exam_id].add(session.student_id);
          return acc;
        }, {});

        nodesWithCounts = nodesWithCounts.map((node) => {
          if (node.kind === "exam" && node.exam_id) {
            const countSet = studentCountMap[node.exam_id];
            return {
              ...node,
              student_count: countSet ? countSet.size : 0,
            };
          }
          return node;
        });
      }
    }

    return NextResponse.json({ nodes: nodesWithCounts });
  } catch (error) {
    console.error("[api] Get folder contents error:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
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

async function sessionHeartbeat(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id, is_active, submitted_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.student_id !== data.studentId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Only update heartbeat if session is active and not submitted
    if (session.is_active && !session.submitted_at) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", data.sessionId);

      if (updateError) throw updateError;

      return NextResponse.json({ success: true });
    } else {
      // Session is not active or already submitted
      return NextResponse.json(
        { error: "Session is not active" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Session heartbeat error:", error);
    return NextResponse.json(
      { error: "Failed to update heartbeat" },
      { status: 500 }
    );
  }
}

async function deactivateSession(data: {
  sessionId: string;
  studentId: string;
}) {
  try {
    // Verify the session belongs to the student
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, student_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.student_id !== data.studentId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Deactivate the session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.sessionId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Deactivate session error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate session" },
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
