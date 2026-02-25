import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@clerk/nextjs/server";
import { compressData } from "@/lib/compression";
import { chunkText, formatChunkMetadata } from "@/lib/chunking";
import { createEmbeddings } from "@/lib/embedding";
import { saveChunksToDB, deleteChunksByFileUrl } from "@/lib/save-chunks";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

// Initialize Supabase client with service role key for server-side operations
const supabase = getSupabaseServer();

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return errorJson("INVALID_JSON", "Invalid JSON in request body", 400);
    }

    const { action, data } = body;

    if (!action) {
      return errorJson("MISSING_ACTION", "Missing 'action' field in request", 400);
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
        return errorJson("INVALID_ACTION", `Invalid action: ${action}`, 400);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return errorJson(
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      500,
      process.env.NODE_ENV === "development"
        ? { message: errorMessage, stack: error instanceof Error ? error.stack : undefined }
        : errorMessage
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
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;

    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403, `User role: ${userRole || "not set"}`);
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
      return errorJson("DATABASE_ERROR", `Database error: ${error.message}`, 500);
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
      // Exam is created but node creation failed - this is not critical
      // but we should log it
      logError("Failed to create exam node", nodeError, { path: "/api/supa", user_id: user.id });
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

          // 2. 기존 청크 삭제 (파일 재처리 시)
          await deleteChunksByFileUrl(exam.id, materialData.url);

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

          await saveChunksToDB(exam.id, chunksToSave);
          totalChunksSaved += chunksToSave.length;
        }
      } catch (ragError) {
        // RAG 처리 실패해도 시험 생성은 성공으로 처리
        logError("[createExam] RAG processing failed (exam creation succeeded)", ragError, {
          path: "/api/supa",
          user_id: user.id,
          additionalData: { examId: exam.id },
        });
      }
    }

    return successJson({ exam, examNode });
  } catch (error) {
    return errorJson("CREATE_EXAM_FAILED", `Failed to create exam: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
  }
}

async function updateExam(data: {
  id: string;
  update: Record<string, unknown>;
}) {
  try {
    // Require instructor auth + ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const { data: exam, error } = await supabase
      .from("exams")
      .update(data.update)
      .eq("id", data.id)
      .eq("instructor_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
      }
      throw error;
    }

    // Audit log: exam status change
    if (data.update.status) {
      auditLog({
        action: "exam_status_change",
        userId: user.id,
        targetId: data.id,
        details: { newStatus: data.update.status },
      });
    }

    return successJson({ exam });
  } catch (error) {
    return errorJson("UPDATE_EXAM_FAILED", "Failed to update exam", 500);
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
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // Compress the session data
    const sessionData = {
      chatHistory: data.chatHistory || [],
      answers: data.answers,
      feedback: data.feedback,
      feedbackResponses: data.feedbackResponses || [],
    };

    const compressedSessionData = compressData(sessionData);

    // Update session with compressed data and deactivate
    // Guard: only update if not already submitted (prevents duplicate submissions)
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .update({
        compressed_session_data: compressedSessionData.data,
        compression_metadata: compressedSessionData.metadata,
        submitted_at: new Date().toISOString(),
        is_active: false, // Deactivate session on submission
      })
      .eq("id", data.sessionId)
      .is("submitted_at", null)
      .select()
      .single();

    if (sessionError) {
      // If no rows matched, session was already submitted
      if (sessionError.code === "PGRST116") {
        return errorJson("ALREADY_SUBMITTED", "This session has already been submitted", 409);
      }
      throw sessionError;
    }

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

    // Audit log: session submit
    auditLog({
      action: "session_submit",
      userId: data.studentId,
      targetId: data.sessionId,
      details: { examId: data.examId, submissionsCount: submissions.length },
    });

    return successJson({
      session,
      submissions,
      compressionStats: compressedSessionData.metadata,
    });
  } catch (error) {
    return errorJson("SUBMIT_EXAM_FAILED", "Failed to submit exam", 500);
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
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }

    return successJson({ exam });
  } catch (error) {
    return errorJson("GET_EXAM_FAILED", "Failed to get exam", 500);
  }
}

async function getExamById(data: { id: string }) {
  try {
    // Validate input
    if (!data || !data.id) {
      return errorJson("MISSING_EXAM_ID", "Missing exam ID", 400, "The 'id' field is required");
    }

    if (typeof data.id !== "string" || data.id.trim() === "") {
      return errorJson("INVALID_EXAM_ID", "Invalid exam ID", 400, "Exam ID must be a non-empty string");
    }

    // Get current user
    let user;
    try {
      user = await currentUser();
    } catch (authError) {
      return errorJson("AUTH_ERROR", "Authentication error", 401, authError instanceof Error ? authError.message : "Unknown auth error");
    }

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;

    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // First, check if exam exists at all (without instructor filter)
    const { data: examExists, error: checkError } = await supabase
      .from("exams")
      .select("id, instructor_id")
      .eq("id", data.id)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404, "No exam exists with this ID");
      }
      throw checkError;
    }

    // Check if exam belongs to this instructor
    if (examExists && examExists.instructor_id !== user.id) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404, "Exam does not belong to this instructor");
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
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404, "No exam found matching the criteria");
      }
      throw error;
    }

    if (!exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404, "Exam data is null");
    }

    return successJson({ exam });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error instanceof Error && error.stack ? error.stack : undefined;
    return errorJson(
      "GET_EXAM_FAILED",
      "Failed to get exam",
      500,
      process.env.NODE_ENV === "development"
        ? { message: errorMessage, stack: errorDetails }
        : errorMessage
    );
  }
}

async function getInstructorExams() {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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

    return successJson({ exams: examsWithCounts });
  } catch (error) {
    return errorJson("GET_EXAMS_FAILED", "Failed to get exams", 500);
  }
}

async function createOrGetSession(data: { examId: string; studentId: string }) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
    const { data: session, error: upsertError } = await supabase
      .from("sessions")
      .upsert(
        {
          exam_id: data.examId,
          student_id: data.studentId,
          used_clarifications: 0,
          created_at: new Date().toISOString(),
        },
        { onConflict: "exam_id,student_id", ignoreDuplicates: true }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;

    // Get existing messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    // 프론트엔드가 기대하는 형식으로 변환 (qIdx 포함)
    const formattedMessages = (messages || []).map((msg) => ({
      type: msg.role === "user" ? "user" : "assistant",
      message: msg.content,
      timestamp: msg.created_at,
      qIdx: msg.q_idx || 0,
    }));

    return successJson({
      session,
      messages: formattedMessages,
    });
  } catch (error) {
    return errorJson("SESSION_FAILED", "Failed to create or get session", 500);
  }
}

// Optimized function to fetch exam AND session in one go
async function initExamSession(data: {
  examCode: string;
  studentId: string;
  deviceFingerprint?: string;
}) {
  try {
    // Verify current user matches the studentId
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Student ID mismatch", 403);
    }

    // 1. Fetch Exam by Code
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.examCode)
      .single();

    if (examError || !exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
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
      return errorJson("EXAM_NOT_AVAILABLE", "Exam not available for joining", 403, { currentStatus: examStatus, message: "This exam is closed or archived" });
    }

    // Gate 필드가 있는 경우: close_at 체크 (입장 마감 시간)
    const hasGateFields = openAt !== null || closeAt !== null;
    if (hasGateFields) {
      const isEntryClosed = closeAt !== null && nowTime >= closeAt;
      if (isEntryClosed) {
        return errorJson("ENTRY_WINDOW_CLOSED", "Entry window closed", 403, { closeAt: exam.close_at, message: "The entry window for this exam has closed" });
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
      // 제출된 세션이 있으면 재시험 불가 - 제출된 세션만 반환

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

      return successJson({
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

        return successJson({
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
      
      // Upsert session (race-safe: uses UNIQUE(exam_id, student_id) constraint)
      const { data: upsertedSession, error: upsertError } = await supabase
        .from("sessions")
        .upsert(
          {
            exam_id: exam.id,
            student_id: data.studentId,
            used_clarifications: 0,
            is_active: true,
            last_heartbeat_at: now,
            device_fingerprint: incomingFingerprint,
            created_at: now,
            status: initialStatus,
            started_at: examStarted ? now : null,
            attempt_timer_started_at: examStarted ? now : null,
          },
          { onConflict: "exam_id,student_id" }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      session = upsertedSession;
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

    return successJson({
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
    return errorJson("INIT_SESSION_FAILED", "Failed to initialize exam session", 500);
  }
}

async function saveDraft(data: {
  sessionId: string;
  questionId: string;
  answer: string;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    const now = new Date().toISOString();

    // First, try to get existing submission for history tracking
    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id, answer, answer_history, edit_count, updated_at, created_at")
      .eq("session_id", data.sessionId)
      .eq("q_idx", data.questionId)
      .maybeSingle();

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
        } catch {
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
      return successJson({ submission: updatedSubmission });
    } else {
      // Upsert new submission (race-safe: uses UNIQUE(session_id, q_idx) constraint)
      const { data: newSubmission, error: upsertError } = await supabase
        .from("submissions")
        .upsert(
          {
            session_id: data.sessionId,
            q_idx: data.questionId,
            answer: data.answer,
            created_at: now,
            updated_at: now,
            edit_count: 0,
            answer_history: [],
          },
          { onConflict: "session_id,q_idx" }
        )
        .select()
        .single();

      if (upsertError) throw upsertError;
      return successJson({ submission: newSubmission });
    }
  } catch (error) {
    return errorJson("SAVE_DRAFT_FAILED", "Failed to save draft", 500);
  }
}

async function saveAllDrafts(data: {
  sessionId: string;
  drafts: Array<{ questionId: string; text: string }>;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

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

    return successJson({ submissions: results });
  } catch (error) {
    return errorJson("SAVE_ALL_DRAFTS_FAILED", "Failed to save all drafts", 500);
  }
}

async function saveDraftAnswers(data: {
  sessionId: string;
  answers: Array<{ questionId: string; text: string }>;
}) {
  try {
    // Verify session ownership
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck || sessionCheck.student_id !== user.id) {
      return errorJson("UNAUTHORIZED", "Session access denied", 403);
    }

    // Fetch session and exam once outside the loop (avoid N+1 queries)
    const { data: session } = await supabase
      .from("sessions")
      .select("exam_id")
      .eq("id", data.sessionId)
      .single();

    if (!session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    const { data: exam } = await supabase
      .from("exams")
      .select("questions")
      .eq("id", session.exam_id)
      .single();

    if (!exam || !exam.questions) {
      return errorJson("EXAM_NOT_FOUND", "Exam or questions not found", 404);
    }

    const questions = exam.questions as Array<{ id: string }>;
    const results = [];

    for (const answer of data.answers) {
      if (answer.text.trim()) {
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

    return successJson({ submissions: results });
  } catch (error) {
    return errorJson("SAVE_DRAFT_ANSWERS_FAILED", "Failed to save draft answers", 500);
  }
}

async function getSessionSubmissions(data: { sessionId: string }) {
  try {
    // Verify session ownership (student or instructor who owns the exam)
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    // Allow access if user is the session owner (student) or the exam's instructor
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await supabase
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("q_idx", { ascending: true });

    if (error) throw error;

    return successJson({ submissions: submissions || [] });
  } catch (error) {
    return errorJson("GET_SUBMISSIONS_FAILED", "Failed to get session submissions", 500);
  }
}

async function getSessionMessages(data: { sessionId: string }) {
  try {
    // Verify session ownership (student or instructor who owns the exam)
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    const { data: sessionCheck } = await supabase
      .from("sessions")
      .select("student_id, exam_id")
      .eq("id", data.sessionId)
      .single();
    if (!sessionCheck) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }
    if (sessionCheck.student_id !== user.id) {
      const { data: examCheck } = await supabase
        .from("exams")
        .select("instructor_id")
        .eq("id", sessionCheck.exam_id)
        .single();
      if (!examCheck || examCheck.instructor_id !== user.id) {
        return errorJson("UNAUTHORIZED", "Session access denied", 403);
      }
    }

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return successJson({ messages: messages || [] });
  } catch (error) {
    return errorJson("GET_MESSAGES_FAILED", "Failed to get session messages", 500);
  }
}

// ========== Exam Nodes (Folder/Drive) Functions ==========

async function createFolder(data: { name: string; parent_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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

    return successJson({ folder });
  } catch (error) {
    return errorJson("CREATE_FOLDER_FAILED", "Failed to create folder", 500);
  }
}

async function getFolderContents(data: { folder_id?: string | null }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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
        logError("Session count query error", sessionsError, { path: "/api/supa" });
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

    return successJson({ nodes: nodesWithCounts });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return errorJson("GET_FOLDER_CONTENTS_FAILED", "Failed to get folder contents", 500, errorMessage);
  }
}

async function getBreadcrumb(data: { folder_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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

      return successJson({ breadcrumb });
    }

    return successJson({ breadcrumb: rpcData || [] });
  } catch (error) {
    return errorJson("GET_BREADCRUMB_FAILED", "Failed to get breadcrumb", 500);
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
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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

    return successJson({ node });
  } catch (error) {
    return errorJson("MOVE_NODE_FAILED", "Failed to move node", 500);
  }
}

async function updateNode(data: { node_id: string; name?: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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

    return successJson({ node });
  } catch (error) {
    return errorJson("UPDATE_NODE_FAILED", "Failed to update node", 500);
  }
}

async function deleteNode(data: { node_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
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
        return errorJson("FOLDER_NOT_EMPTY", "Cannot delete folder with contents", 400);
      }
    }

    // Delete the node (CASCADE will handle exam deletion if needed)
    const { error: deleteError } = await supabase
      .from("exam_nodes")
      .delete()
      .eq("id", data.node_id)
      .eq("instructor_id", user.id);

    if (deleteError) throw deleteError;

    return successJson({});
  } catch (error) {
    return errorJson("DELETE_NODE_FAILED", "Failed to delete node", 500);
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
      .select("id, student_id, is_active, submitted_at, created_at, exam_id, status, started_at, attempt_timer_started_at")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // ✅ 이미 제출된 경우
    if (session.submitted_at) {
      return successJson({
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
      // 시험 정보를 가져오지 못해도 하트비트는 계속 진행
      if (examError) {
        logError("Failed to fetch exam for heartbeat", examError, { path: "/api/supa" });
      }
    } else {
      // ✅ Gate 방식: attempt_timer_started_at 기준으로 시간 체크
      // InProgress 상태이고 타이머가 시작된 경우만 시간 체크
      const sessionStatus = (session.status as string) || "not_joined";
      const timerStartTime = session.attempt_timer_started_at
        ? new Date(session.attempt_timer_started_at as string).getTime()
        : session.started_at
        ? new Date(session.started_at as string).getTime()
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
            logError("Failed to auto-submit session", updateError, { path: "/api/supa", additionalData: { sessionId: data.sessionId } });
          }

          return successJson({
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
      const sessionStatus = (session.status as string) || "not_joined";
      const timerStartTime = session.attempt_timer_started_at
        ? new Date(session.attempt_timer_started_at as string).getTime()
        : session.started_at
        ? new Date(session.started_at as string).getTime()
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

      return successJson({
        timeRemaining,
      });
    } else {
      // Session is not active or already submitted
      return errorJson("SESSION_INACTIVE", "Session is not active", 400);
    }
  } catch (error) {
    return errorJson("HEARTBEAT_FAILED", "Failed to update heartbeat", 500);
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
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== data.studentId) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 403);
    }

    // Deactivate the session
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.sessionId);

    if (updateError) throw updateError;

    return successJson({});
  } catch (error) {
    return errorJson("DEACTIVATE_SESSION_FAILED", "Failed to deactivate session", 500);
  }
}

async function getInstructorDrive() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get root level nodes (parent_id is null)
    return await getFolderContents({ folder_id: null });
  } catch (error) {
    return errorJson("GET_DRIVE_FAILED", "Failed to get instructor drive", 500);
  }
}

async function copyExam(data: { exam_id: string }) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Get the original exam
    const { data: originalExam, error: examError } = await supabase
      .from("exams")
      .select("*")
      .eq("id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (examError || !originalExam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
    }

    // Get the original exam node to preserve parent folder
    const { data: originalNode, error: nodeError } = await supabase
      .from("exam_nodes")
      .select("*")
      .eq("exam_id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (nodeError || !originalNode) {
      logError("Original exam node not found", nodeError, { path: "/api/supa", user_id: user.id, additionalData: { examId: data.exam_id } });
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
      return errorJson("COPY_EXAM_FAILED", "Failed to create copied exam", 500);
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
      // Exam is created but node creation failed - this is not critical
      logError("Failed to create exam node for copy", nodeCreateError, { path: "/api/supa", user_id: user.id, additionalData: { examId: newExam.id } });
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
        logError("[copyExam] RAG processing failed (exam copy succeeded)", ragError, {
          path: "/api/supa",
          user_id: user.id,
          additionalData: { examId: newExam.id },
        });
      }
    }

    return successJson({ exam: newExam, examNode });
  } catch (error) {
    return errorJson("COPY_EXAM_FAILED", `Failed to copy exam: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
  }
}
