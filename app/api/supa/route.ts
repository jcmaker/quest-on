import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";
import { compressData } from "@/lib/compression";
import { chunkText, formatChunkMetadata } from "@/lib/chunking";
import { createEmbeddings } from "@/lib/embedding";
import { saveChunksToDB, deleteChunksByFileUrl } from "@/lib/save-chunks";

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
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error("JSON parsing error:", jsonError);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { action, data } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing 'action' field in request" },
        { status: 400 }
      );
    }

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
      case "copy_exam":
        return await copyExam(data);
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Supabase API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Internal server error",
        details: errorMessage,
        ...(process.env.NODE_ENV === "development" && {
          stack: error instanceof Error ? error.stack : undefined,
        }),
      },
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

    if (userRole !== "instructor") {
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
    // NOTE: core_ability(핵심 역량) 필드는 제거되었으므로 저장 시 항상 제거한다.
    const sanitizedQuestions = (data.questions || []).map((q) => {
      const { core_ability, ...rest } = q as QuestionData & {
        core_ability?: unknown;
      };
      return rest;
    });

    const examData = {
      title: data.title,
      code: data.code,
      description: null, // description 필드는 nullable이므로 null로 설정
      duration: data.duration,
      questions: sanitizedQuestions,
      materials: data.materials || [],
      materials_text: data.materials_text || [], // 추출된 텍스트 저장
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
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

    // RAG: materials_text가 있으면 청킹 및 임베딩 생성 후 저장
        if (
      examData.materials_text &&
      Array.isArray(examData.materials_text) &&
      examData.materials_text.length > 0
    ) {
      try {

        let totalChunksSaved = 0;

        for (let idx = 0; idx < examData.materials_text.length; idx++) {
          const material = examData.materials_text[idx];
          const materialData = material as {
            url: string;
            text: string;
            fileName: string;
          };

          if (!materialData.text || materialData.text.trim().length === 0) {
            continue;
          }

          // 1. 텍스트 청킹
          const chunkStartTime = Date.now();
          const chunks = chunkText(materialData.text, {
            chunkSize: 800,
            chunkOverlap: 200,
          });
          const chunkDuration = Date.now() - chunkStartTime;

          if (chunks.length === 0) {
            continue;
          }

          // 2. 기존 청크 삭제 (파일 재처리 시)
          await deleteChunksByFileUrl(exam.id, materialData.url);

          // 3. 청크 포맷팅
          const formattedChunks = chunks.map((chunk) =>
            formatChunkMetadata(chunk, materialData.fileName, materialData.url)
          );

          // 4. 임베딩 생성 (배치)
          const embeddingStartTime = Date.now();
          const chunkTexts = formattedChunks.map((c) => c.content);
          const embeddings = await createEmbeddings(chunkTexts);
          const embeddingDuration = Date.now() - embeddingStartTime;

          // 5. DB에 저장
          const chunksToSave = formattedChunks.map((chunk, index) => ({
            content: chunk.content,
            embedding: embeddings[index],
            metadata: chunk.metadata,
          }));

          await saveChunksToDB(exam.id, chunksToSave);
          totalChunksSaved += chunksToSave.length;
        }
      } catch (ragError) {
        // RAG 처리 실패해도 시험 생성은 성공으로 처리
        console.error("❌ [createExam] RAG 처리 실패 (시험 생성은 성공):", {
          examId: exam.id,
          error:
            ragError instanceof Error ? ragError.message : String(ragError),
          stack: ragError instanceof Error ? ragError.stack : undefined,
        });
      }
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
    // Validate input
    if (!data || !data.id) {
      console.error("API: Missing exam ID");
      return NextResponse.json(
        { error: "Missing exam ID", details: "The 'id' field is required" },
        { status: 400 }
      );
    }

    if (typeof data.id !== "string" || data.id.trim() === "") {
      console.error("API: Invalid exam ID format:", data.id);
      return NextResponse.json(
        {
          error: "Invalid exam ID",
          details: "Exam ID must be a non-empty string",
        },
        { status: 400 }
      );
    }

    // Get current user
    let user;
    try {
      user = await currentUser();
    } catch (authError) {
      console.error("API: Error getting current user:", authError);
      return NextResponse.json(
        {
          error: "Authentication error",
          details:
            authError instanceof Error
              ? authError.message
              : "Unknown auth error",
        },
        { status: 401 }
      );
    }

    if (!user) {
      console.error("API: No user found");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;

    if (userRole !== "instructor") {
      console.error("API: User is not instructor");
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // First, check if exam exists at all (without instructor filter)
    const { data: examExists, error: checkError } = await supabase
      .from("exams")
      .select("id, instructor_id")
      .eq("id", data.id)
      .single();

    if (checkError) {
      console.error("API: Error checking exam existence:", checkError);
      if (checkError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Exam not found", details: "No exam exists with this ID" },
          { status: 404 }
        );
      }
      throw checkError;
    }

    // Check if exam belongs to this instructor
    if (examExists && examExists.instructor_id !== user.id) {
      console.error("API: Exam belongs to different instructor:", {
        examId: data.id,
        examInstructorId: examExists.instructor_id,
        currentUserId: user.id,
      });
      return NextResponse.json(
        {
          error: "Exam not found",
          details: "Exam does not belong to this instructor",
        },
        { status: 404 }
      );
    }

    // Now fetch the full exam data (Gate 필드 포함)
    const { data: exam, error } = await supabase
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, rubric, rubric_public, status, instructor_id, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting"
      )
      .eq("id", data.id)
      .eq("instructor_id", user.id) // Only allow instructors to view their own exams
      .single();

    if (error) {
      console.error("API: Database error:", error);
      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            error: "Exam not found",
            details: "No exam found matching the criteria",
          },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!exam) {
      console.error("API: Exam query returned no data");
      return NextResponse.json(
        { error: "Exam not found", details: "Exam data is null" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Get exam by ID error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error instanceof Error && error.stack ? error.stack : undefined;
    console.error("Error details:", { errorMessage, errorDetails });
    return NextResponse.json(
      {
        error: "Failed to get exam",
        details: errorMessage,
        ...(process.env.NODE_ENV === "development" && { stack: errorDetails }),
      },
      { status: 500 }
    );
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
    // Check if session already exists
    const { data: existingSessions, error: checkError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", data.examId)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

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
    // 1. Fetch Exam by Code
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // ✅ Gate 방식: 시험 상태 및 입장 가능 여부 확인
    const now = new Date().toISOString();
    const nowTime = new Date().getTime();
    const examStatus = exam.status || "draft";
    const openAt = exam.open_at ? new Date(exam.open_at).getTime() : null;
    const closeAt = exam.close_at ? new Date(exam.close_at).getTime() : null;
    const startedAt = exam.started_at ? new Date(exam.started_at).getTime() : null;

    // ✅ 기본 원칙: 시작 전(draft/joinable/scheduled)에는 Join만 가능, 응시는 불가
    // Running 상태에서만 실제 응시 가능
    
    // Closed 상태는 Join 불가
    if (examStatus === "closed" || examStatus === "archived") {
      return NextResponse.json(
        {
          error: "Exam not available for joining",
          currentStatus: examStatus,
          message: "This exam is closed or archived",
        },
        { status: 403 }
      );
    }

    // Gate 필드가 있는 경우: close_at 체크 (입장 마감 시간)
    const hasGateFields = openAt !== null || closeAt !== null;
    if (hasGateFields) {
      const isEntryClosed = closeAt !== null && nowTime >= closeAt;
      if (isEntryClosed) {
        return NextResponse.json(
          {
            error: "Entry window closed",
            closeAt: exam.close_at,
            message: "The entry window for this exam has closed",
          },
          { status: 403 }
        );
      }
    }

    // core_ability(핵심 역량) 필드는 제거되었으므로, 세션 init 응답에서도 제거한다.
    if (exam.questions && Array.isArray(exam.questions)) {
      exam.questions = exam.questions.map((q: Record<string, unknown>) => {
        const { core_ability, ...rest } = q as Record<string, unknown> & {
          core_ability?: unknown;
        };
        return rest;
      });
    }

    // 2. Get all existing sessions (most recent first)
    const { data: existingSessions, error: checkError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exam_id", exam.id)
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });

    if (checkError) throw checkError;

    // ✅ 요구사항: 이미 제출된 세션이 있으면 재시험 불가
    const mostRecentSubmittedSession =
      (existingSessions || []).find((s) => !!s.submitted_at) || null;

    if (mostRecentSubmittedSession) {

      // Get messages for submitted session (read-only)
      const { data: sessionMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", mostRecentSubmittedSession.id)
        .order("created_at", { ascending: true });

      const messages = (sessionMessages || []).map((msg) => ({
        type: msg.role === "user" ? "user" : "assistant",
        message: msg.content,
        timestamp: msg.created_at,
        qIdx: msg.q_idx || 0,
      }));

      return NextResponse.json({
        exam,
        session: mostRecentSubmittedSession,
        messages,
        isRetakeBlocked: true, // 재시험 차단 플래그
      });
    }

    // 제출되지 않은 세션만 처리
    const unsubmittedSessions = (existingSessions || []).filter(
      (s) => !s.submitted_at
    );

    const incomingFingerprint = data.deviceFingerprint || null;

    const exactDeviceMatch =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find(
            (s) => s.device_fingerprint === incomingFingerprint
          ) || null;

    // Legacy: device_fingerprint가 비어있는 예전 세션이 있으면, 첫 접속에서 "소유"하도록 할당
    const claimableLegacySession =
      incomingFingerprint === null
        ? null
        : unsubmittedSessions.find((s) => !s.device_fingerprint) || null;

    let existingSession: (typeof existingSessions)[0] | null =
      exactDeviceMatch || claimableLegacySession || null;

    let session = existingSession;
    let messages: Array<{
      type: "user" | "assistant";
      message: string;
      timestamp: string;
      qIdx: number;
    }> = [];

    if (existingSession && !existingSession.submitted_at) {
      // ✅ Gate 방식: 세션 상태 확인 및 타이머 계산
      const sessionStatus = existingSession.status || "not_joined";
      
      // ✅ 중요: 타이머는 in_progress 상태이고 attempt_timer_started_at이 설정된 경우에만 시작됨
      // waiting 상태에서는 타이머가 시작되지 않으므로 시간 체크를 하지 않음
      const timerStartTime = existingSession.attempt_timer_started_at
        ? new Date(existingSession.attempt_timer_started_at).getTime()
        : null;
      
      // ✅ 시험 시간 종료 체크는 in_progress 상태이고 타이머가 시작된 경우에만 수행
      if (sessionStatus === "in_progress" && timerStartTime !== null && exam.duration !== 0) {
        const examDurationMs = exam.duration * 60 * 1000; // 분을 밀리초로 변환
        const sessionEndTime = timerStartTime + examDurationMs;
        const timeRemaining = sessionEndTime - nowTime;

        // 시간 종료 체크 및 자동 제출 처리
        if (timeRemaining <= 0) {
        // 기존 답안 가져오기
        const { data: existingSubmissions } = await supabase
          .from("submissions")
          .select("*")
          .eq("session_id", existingSession.id);

        // 자동 제출 처리 (빈 답안이라도 제출)
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            submitted_at: now,
            is_active: false,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;

        // 메시지 로드
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

        return NextResponse.json({
          exam,
          session,
          messages,
          autoSubmitted: true, // 자동 제출 플래그
          timeExpired: true,
        });
      }
      }

      // ✅ 세션 상태에 따라 처리: 기본적으로 시작 전에는 waiting, 시작 후에는 in_progress
      const currentStatus = existingSession.status || "not_joined";
      const examStarted = examStatus === "running" && startedAt !== null && nowTime >= startedAt;
      
      // 이미 InProgress인 경우 (시험이 시작된 경우)
      if (currentStatus === "in_progress") {
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      } else if (examStarted && currentStatus === "waiting") {
        // 시험이 시작되었고 세션이 waiting 상태인 경우 → in_progress로 전환
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
            status: "in_progress",
            started_at: now,
            attempt_timer_started_at: now,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      } else {
        // Waiting 상태인 경우 (시험 시작 대기 중)
        const { data: updatedSession, error: updateError } = await supabase
          .from("sessions")
          .update({
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint:
              incomingFingerprint || existingSession.device_fingerprint || null,
            // 상태가 없거나 joined인 경우 waiting으로 설정
            status: currentStatus === "joined" || !currentStatus ? "waiting" : currentStatus,
          })
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;
        session = updatedSession;
      }

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
    } else {
      // ✅ 새 세션 생성: 기본적으로 시작 전에는 waiting 상태
      
      // 시험이 이미 시작되었는지 확인 (started_at이 있고 status가 running)
      const examStarted = examStatus === "running" && startedAt !== null && nowTime >= startedAt;
      
      // 시작 전: waiting 상태 (Join만 가능, 응시 불가)
      // 시작 후: in_progress 상태 (실제 응시 가능)
      const initialStatus = examStarted ? "in_progress" : "waiting";
      
      const { data: newSession, error: createError } = await supabase
        .from("sessions")
        .insert([
          {
            exam_id: exam.id,
            student_id: data.studentId,
            used_clarifications: 0,
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint: incomingFingerprint,
            created_at: now,
            status: initialStatus,
            // 시험이 이미 시작되었으면 타이머 시작 시간 설정
            started_at: examStarted ? now : null,
            attempt_timer_started_at: examStarted ? now : null,
          },
        ])
        .select()
        .single();

      if (createError) throw createError;
      session = newSession;
    }

    // ✅ Gate 방식: 타이머 계산 (attempt_timer_started_at 기준)
    const sessionStatus = session.status || "not_joined";
    const timerStartTime = session.attempt_timer_started_at
      ? new Date(session.attempt_timer_started_at).getTime()
      : session.started_at
      ? new Date(session.started_at).getTime()
      : null;

    // InProgress 상태이고 타이머가 시작된 경우만 시간 계산
    let timeRemaining = null;
    let sessionStartTime = session.created_at;

    if (sessionStatus === "in_progress" && timerStartTime !== null) {
      sessionStartTime = new Date(session.attempt_timer_started_at || session.started_at || session.created_at).toISOString();
      
      // duration이 0(무제한)이면 만료 시간을 먼 미래로 설정 (100년 후)
      const examDurationMs =
        exam.duration === 0
          ? 100 * 365 * 24 * 60 * 60 * 1000 // 100년을 밀리초로 변환
          : exam.duration * 60 * 1000; // 분을 밀리초로 변환
      const sessionEndTime = timerStartTime + examDurationMs;
      timeRemaining = Math.max(0, sessionEndTime - nowTime);
    }

    return NextResponse.json({
      exam,
      session,
      messages,
      sessionStartTime,
      timeRemaining:
        exam.duration === 0 || timeRemaining === null
          ? null // 무제한이거나 타이머가 시작되지 않은 경우 null 반환
          : Math.floor(timeRemaining / 1000), // 초 단위
      sessionStatus, // 세션 상태 반환 (Waiting Room 표시용)
      gateStarted: examStatus === "running" && startedAt !== null && nowTime >= startedAt, // 시험 시작 여부
    });
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

    let nodesWithCounts = nodes || [];

    const examNodes = nodesWithCounts.filter(
      (node) => node.kind === "exam" && node.exam_id
    );

    if (examNodes.length > 0) {
      const examIds = examNodes
        .map((node) => node.exam_id)
        .filter(Boolean) as string[];

      // Optimized query: Use DISTINCT ON or aggregate to get unique student counts per exam
      // This is more efficient than fetching all sessions and processing in memory
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("exam_id, student_id")
        .in("exam_id", examIds);

      if (sessionsError) {
        console.error("Session count query error:", sessionsError);
      } else if (sessionsData) {
        // Use Map for O(1) lookups instead of nested objects
        const studentCountMap = new Map<string, Set<string>>();

        // Build count map efficiently
        for (const session of sessionsData) {
          if (!session.exam_id || !session.student_id) continue;
          if (!studentCountMap.has(session.exam_id)) {
            studentCountMap.set(session.exam_id, new Set());
          }
          studentCountMap.get(session.exam_id)!.add(session.student_id);
        }

        // Update nodes with counts
        nodesWithCounts = nodesWithCounts.map((node) => {
          if (node.kind === "exam" && node.exam_id) {
            const countSet = studentCountMap.get(node.exam_id);
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
      .select("id, student_id, is_active, submitted_at, created_at, exam_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.student_id !== data.studentId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ✅ 이미 제출된 경우
    if (session.submitted_at) {
      return NextResponse.json({ 
        success: true,
        submitted: true,
      });
    }

    // ✅ 시험 정보 가져와서 시간 체크
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("duration")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      console.error("Failed to fetch exam for heartbeat:", examError);
      // 시험 정보를 가져오지 못해도 하트비트는 계속 진행
    } else {
      // ✅ Gate 방식: attempt_timer_started_at 기준으로 시간 체크
      // InProgress 상태이고 타이머가 시작된 경우만 시간 체크
      const sessionStatus = (session as any).status || "not_joined";
      const timerStartTime = (session as any).attempt_timer_started_at
        ? new Date((session as any).attempt_timer_started_at).getTime()
        : (session as any).started_at
        ? new Date((session as any).started_at).getTime()
        : null;

      if (sessionStatus === "in_progress" && timerStartTime !== null && exam.duration !== 0) {
        const examDurationMs = exam.duration * 60 * 1000;
        const sessionEndTime = timerStartTime + examDurationMs;
        const now = Date.now();
        const timeRemaining = sessionEndTime - now;

        if (timeRemaining <= 0) {
          // ✅ 시간 종료 - 자동 제출 처리

          const { error: updateError } = await supabase
            .from("sessions")
            .update({
              submitted_at: new Date().toISOString(),
              status: "auto_submitted",
              auto_submitted: true,
              is_active: false,
            })
            .eq("id", data.sessionId);

          if (updateError) {
            console.error("Failed to auto-submit session:", updateError);
          }

          return NextResponse.json({
            success: true,
            timeExpired: true,
            autoSubmitted: true,
          });
        }
      }
    }

    // Only update heartbeat if session is active and not submitted
    if (session.is_active && !session.submitted_at) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", data.sessionId);

      if (updateError) throw updateError;

      // ✅ Gate 방식: attempt_timer_started_at 기준으로 남은 시간 계산
      let timeRemaining = null;
      const sessionStatus = (session as any).status || "not_joined";
      const timerStartTime = (session as any).attempt_timer_started_at
        ? new Date((session as any).attempt_timer_started_at).getTime()
        : (session as any).started_at
        ? new Date((session as any).started_at).getTime()
        : null;

    if (
      exam &&
      exam.duration !== 0 &&
      sessionStatus === "in_progress" &&
      timerStartTime !== null
    ) {
        const examDurationMs = exam.duration * 60 * 1000;
        const sessionEndTime = timerStartTime + examDurationMs;
        const now = Date.now();
        timeRemaining = Math.max(0, Math.floor((sessionEndTime - now) / 1000));
      }
      // duration이 0이거나 타이머가 시작되지 않았으면 timeRemaining은 null로 유지

      return NextResponse.json({ 
        success: true,
        timeRemaining,
      });
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

async function copyExam(data: { exam_id: string }) {
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

    // Get the original exam
    const { data: originalExam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (examError || !originalExam) {
      return NextResponse.json(
        { error: "Exam not found or access denied" },
        { status: 404 }
      );
    }

    // Get the original exam node to preserve parent folder
    const { data: originalNode, error: nodeError } = await supabase
      .from("exam_nodes")
      .select("*")
      .eq("exam_id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (nodeError || !originalNode) {
      console.error("Original exam node not found:", nodeError);
    }

    // Generate new exam code
    const generateExamCode = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let result = "";
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    let newCode = generateExamCode();
    // Ensure code is unique
    let codeCheck = await supabase
      .from("exams")
      .select("code")
      .eq("code", newCode)
      .single();
    
    while (!codeCheck.error) {
      newCode = generateExamCode();
      codeCheck = await supabase
        .from("exams")
        .select("code")
        .eq("code", newCode)
        .single();
    }

    // Prepare copied exam data
    const newTitle = `${originalExam.title} (복사본)`;
    const now = new Date().toISOString();

    // Sanitize questions (remove core_ability if present)
    const sanitizedQuestions = Array.isArray(originalExam.questions)
      ? originalExam.questions.map((q: QuestionData & { core_ability?: unknown }) => {
          const { core_ability, ...rest } = q;
          return rest;
        })
      : [];

    const examData = {
      title: newTitle,
      code: newCode,
      description: originalExam.description || null,
      duration: originalExam.duration,
      questions: sanitizedQuestions,
      materials: originalExam.materials || [],
      materials_text: originalExam.materials_text || [], // 복사본도 materials_text 포함
      rubric: originalExam.rubric || [],
      rubric_public: originalExam.rubric_public || false,
      status: "draft", // 복사본은 초안 상태로 시작
      instructor_id: user.id,
      created_at: now,
      updated_at: now,
    };

    // Create the new exam
    const { data: newExam, error: createError } = await supabase
      .from("exams")
      .insert([examData])
      .select()
      .single();

    if (createError || !newExam) {
      console.error("Failed to create copied exam:", createError);
      return NextResponse.json(
        { error: "Failed to create copied exam" },
        { status: 500 }
      );
    }

    // Create exam node (preserve parent folder)
    const parentId = originalNode?.parent_id || null;

    // Get the maximum sort_order for this parent folder
    let sortQuery = supabase
      .from("exam_nodes")
      .select("sort_order")
      .eq("instructor_id", user.id);

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

    const { data: examNode, error: nodeCreateError } = await supabase
      .from("exam_nodes")
      .insert([
        {
          instructor_id: user.id,
          parent_id: parentId,
          kind: "exam",
          name: newTitle,
          exam_id: newExam.id,
          sort_order: nextSortOrder,
        },
      ])
      .select()
      .single();

    if (nodeCreateError) {
      console.error("Failed to create exam node:", nodeCreateError);
      // Exam is created but node creation failed - this is not critical
    }

    // RAG: materials_text가 있으면 청킹 및 임베딩 생성 후 저장
    if (
      examData.materials_text &&
      Array.isArray(examData.materials_text) &&
      examData.materials_text.length > 0
    ) {
      try {

        let totalChunksSaved = 0;

        for (let idx = 0; idx < examData.materials_text.length; idx++) {
          const material = examData.materials_text[idx];
          const materialData = material as {
            url: string;
            text: string;
            fileName: string;
          };
 
          if (!materialData.text || materialData.text.trim().length === 0) {
            continue;
          }

          // 1. 텍스트 청킹
          const chunks = chunkText(materialData.text, {
            chunkSize: 800,
            chunkOverlap: 200,
          });

          if (chunks.length === 0) {
            continue;
          }

          // 2. 기존 청크 삭제 (이미 새 시험이므로 없을 것이지만 안전을 위해)
          await deleteChunksByFileUrl(newExam.id, materialData.url);

          // 3. 청크 포맷팅
          const formattedChunks = chunks.map((chunk) =>
            formatChunkMetadata(chunk, materialData.fileName, materialData.url)
          );

          // 4. 임베딩 생성 (배치)
          const chunkTexts = formattedChunks.map((c) => c.content);
          const embeddings = await createEmbeddings(chunkTexts);

          // 5. DB에 저장
          const chunksToSave = formattedChunks.map((chunk, index) => ({
            content: chunk.content,
            embedding: embeddings[index],
            metadata: chunk.metadata,
          }));

          await saveChunksToDB(newExam.id, chunksToSave);
          totalChunksSaved += chunksToSave.length;
        }
      } catch (ragError) {
        // RAG 처리 실패해도 시험 복사는 성공으로 처리
        console.error("❌ [copyExam] RAG 처리 실패 (시험 복사는 성공):", {
          examId: newExam.id,
          error:
            ragError instanceof Error ? ragError.message : String(ragError),
        });
      }
    }

    return NextResponse.json({ exam: newExam, examNode });
  } catch (error) {
    console.error("Copy exam error:", error);
    return NextResponse.json(
      {
        error: `Failed to copy exam: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
