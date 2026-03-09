import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { chunkText, formatChunkMetadata } from "@/lib/chunking";
import { createEmbeddings } from "@/lib/embedding";
import { saveChunksToDB, deleteChunksByFileUrl } from "@/lib/save-chunks";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

// Lazy Supabase client getter — creates a fresh client per invocation
// to avoid stale connections in serverless environments
function getSupabase() {
  return getSupabaseServer();
}

export interface QuestionData {
  id: string;
  text: string;
  type: "multiple-choice" | "essay" | "short-answer";
  options?: string[];
  correctAnswer?: string;
}

export async function createExam(data: {
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
  chat_weight?: number | null;
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
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // 시험 코드 중복 검증 및 자동 재생성
    let examCode = data.code;
    const { data: existingExam } = await getSupabase()
      .from("exams")
      .select("code")
      .eq("code", examCode)
      .single();

    if (existingExam) {
      // 중복 시 새 코드 생성 (copyExam 패턴 적용)
      const generateExamCode = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      let newCode = generateExamCode();
      let codeCheck = await getSupabase()
        .from("exams")
        .select("code")
        .eq("code", newCode)
        .maybeSingle();

      while (codeCheck.data !== null) {
        newCode = generateExamCode();
        codeCheck = await getSupabase()
          .from("exams")
          .select("code")
          .eq("code", newCode)
          .maybeSingle();
      }
      examCode = newCode;
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
      code: examCode,
      description: null, // description 필드는 nullable이므로 null로 설정
      duration: data.duration,
      questions: sanitizedQuestions,
      materials: data.materials || [],
      materials_text: data.materials_text || [], // 추출된 텍스트 저장
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
      chat_weight: data.chat_weight ?? 50,
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    // INSERT with UNIQUE violation retry (handles TOCTOU race between code check and insert)
    const MAX_INSERT_RETRIES = 3;
    let exam = null;
    let lastInsertError = null;

    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const { data: inserted, error: insertErr } = await getSupabase()
        .from("exams")
        .insert([examData])
        .select()
        .single();

      if (!insertErr) {
        exam = inserted;
        lastInsertError = null;
        break;
      }

      // Postgres UNIQUE violation = code 23505
      if (insertErr.code === "23505" && attempt < MAX_INSERT_RETRIES - 1) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let retryCode = "";
        for (let i = 0; i < 6; i++) {
          retryCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        examData.code = retryCode;
        examCode = retryCode;
        continue;
      }

      lastInsertError = insertErr;
      break;
    }

    if (lastInsertError || !exam) {
      logError("[createExam] Database error during exam insert", lastInsertError, { path: "/api/supa/exam-handlers" });
      return errorJson("DATABASE_ERROR", "Database error", 500);
    }

    // Create exam node in exam_nodes table
    // parent_id는 data에서 받거나 null (루트에 배치)
    const parentId = data.parent_folder_id || null;

    // Get the maximum sort_order for this parent folder
    let sortQuery = getSupabase()
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
    const { data: examNode, error: nodeError } = await getSupabase()
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
      logError("Failed to create exam node, rolling back exam", nodeError, { path: "/api/supa", user_id: user.id, additionalData: { examId: exam.id } });
      // Rollback: delete the orphaned exam and any material chunks
      await Promise.all([
        getSupabase().from("exams").delete().eq("id", exam.id),
        getSupabase().from("exam_material_chunks").delete().eq("exam_id", exam.id),
      ]);
      return errorJson("DATABASE_ERROR", "Failed to create exam", 500);
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
          const embeddings = await createEmbeddings(chunkTexts, {
            route: "/api/supa",
            userId: user.id,
            examId: exam.id,
            metadata: {
              source: "create_exam_materials",
              material_index: idx,
            },
          });

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
    logError("[createExam] Failed to create exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("CREATE_EXAM_FAILED", "Failed to create exam", 500);
  }
}

export async function updateExam(data: {
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

    // If exam code is being changed, verify no sessions exist
    if (data.update.code !== undefined) {
      const { data: sessions } = await getSupabase()
        .from("sessions")
        .select("id")
        .eq("exam_id", data.id)
        .limit(1);

      if (sessions && sessions.length > 0) {
        return errorJson(
          "CODE_LOCKED",
          "학생이 이미 참여한 시험의 코드는 변경할 수 없습니다.",
          409
        );
      }
    }

    const { data: exam, error } = await getSupabase()
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

    // Audit log: exam status change (awaited for critical operations)
    if (data.update.status) {
      await auditLog({
        action: "exam_status_change",
        userId: user.id,
        targetId: data.id,
        details: { newStatus: data.update.status },
      });
    }

    return successJson({ exam });
  } catch (error) {
    logError("[updateExam] Failed to update exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("UPDATE_EXAM_FAILED", "Failed to update exam", 500);
  }
}

export async function getExam(data: { code: string }) {
  try {
    const { data: exam, error } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, rubric, rubric_public, chat_weight, status, instructor_id, materials, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting")
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
    logError("[getExam] Failed to get exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAM_FAILED", "Failed to get exam", 500);
  }
}

export async function getExamById(data: { id: string }) {
  try {
    // Validate input
    if (!data || !data.id) {
      return errorJson("MISSING_EXAM_ID", "Missing exam ID", 400);
    }

    if (typeof data.id !== "string" || data.id.trim() === "") {
      return errorJson("INVALID_EXAM_ID", "Invalid exam ID", 400);
    }

    // Get current user
    let user;
    try {
      user = await currentUser();
    } catch (authError) {
      logError("[getExamById] Authentication error", authError, { path: "/api/supa/exam-handlers" });
      return errorJson("AUTH_ERROR", "Authentication error", 401);
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
    const { data: examExists, error: checkError } = await getSupabase()
      .from("exams")
      .select("id, instructor_id")
      .eq("id", data.id)
      .single();

    if (checkError) {
      if (checkError.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw checkError;
    }

    // Check if exam belongs to this instructor
    if (examExists && examExists.instructor_id !== user.id) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    // Now fetch the full exam data (Gate 필드 포함)
    const { data: exam, error } = await getSupabase()
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, materials_text, rubric, rubric_public, chat_weight, status, instructor_id, created_at, updated_at, open_at, close_at, started_at, allow_draft_in_waiting, allow_chat_in_waiting"
      )
      .eq("id", data.id)
      .eq("instructor_id", user.id) // Only allow instructors to view their own exams
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }

    if (!exam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found", 404);
    }

    return successJson({ exam });
  } catch (error) {
    logError("[getExamById] Failed to get exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAM_FAILED", "Failed to get exam", 500);
  }
}

export async function getInstructorExams() {
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

    const { data: exams, error } = await getSupabase()
      .from("exams")
      .select(
        "id, title, code, description, duration, questions, materials, status, instructor_id, created_at, updated_at"
      )
      .eq("instructor_id", user.id) // Clerk user ID
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Batch fetch all session student_ids in a single query (N+1 → 2 queries)
    const examIds = (exams || []).map((e) => e.id);
    const studentCountMap = new Map<string, number>();

    if (examIds.length > 0) {
      const { data: allSessions } = await getSupabase()
        .from("sessions")
        .select("exam_id, student_id")
        .in("exam_id", examIds)
        .limit(10000);

      if (allSessions) {
        // Group by exam_id and count distinct student_ids
        const examStudents = new Map<string, Set<string>>();
        for (const session of allSessions) {
          if (!examStudents.has(session.exam_id)) {
            examStudents.set(session.exam_id, new Set());
          }
          examStudents.get(session.exam_id)!.add(session.student_id);
        }
        for (const [examId, students] of examStudents) {
          studentCountMap.set(examId, students.size);
        }
      }
    }

    const examsWithCounts = (exams || []).map((exam) => ({
      ...exam,
      questionsCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
      student_count: studentCountMap.get(exam.id) || 0,
    }));

    return successJson({ exams: examsWithCounts });
  } catch (error) {
    logError("[getInstructorExams] Failed to get exams", error, { path: "/api/supa/exam-handlers" });
    return errorJson("GET_EXAMS_FAILED", "Failed to get exams", 500);
  }
}

export async function copyExam(data: { exam_id: string }) {
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
    const { data: originalExam, error: examError } = await getSupabase()
      .from("exams")
      .select("id, title, code, description, duration, questions, materials, materials_text, rubric, rubric_public, chat_weight, status, instructor_id, created_at, updated_at")
      .eq("id", data.exam_id)
      .eq("instructor_id", user.id)
      .single();

    if (examError || !originalExam) {
      return errorJson("EXAM_NOT_FOUND", "Exam not found or access denied", 404);
    }

    // Get the original exam node to preserve parent folder
    const { data: originalNode, error: nodeError } = await getSupabase()
      .from("exam_nodes")
      .select("id, parent_id, sort_order")
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
    let codeCheck = await getSupabase()
      .from("exams")
      .select("code")
      .eq("code", newCode)
      .single();

    while (!codeCheck.error) {
      newCode = generateExamCode();
      codeCheck = await getSupabase()
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
      chat_weight: originalExam.chat_weight ?? 50,
      status: "draft", // 복사본은 초안 상태로 시작
      instructor_id: user.id,
      created_at: now,
      updated_at: now,
    };

    // Create the new exam
    const { data: newExam, error: createError } = await getSupabase()
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
    let sortQuery = getSupabase()
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

    const { data: examNode, error: nodeCreateError } = await getSupabase()
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
          const embeddings = await createEmbeddings(chunkTexts, {
            route: "/api/supa",
            userId: user.id,
            examId: newExam.id,
            metadata: {
              source: "copy_exam_materials",
              material_index: idx,
            },
          });

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
    logError("[copyExam] Failed to copy exam", error, { path: "/api/supa/exam-handlers" });
    return errorJson("COPY_EXAM_FAILED", "Failed to copy exam", 500);
  }
}
