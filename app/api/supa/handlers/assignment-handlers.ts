import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

function getSupabase() {
  return getSupabaseServer();
}

/** Fire-and-forget: dispatch RAG processing to the internal async route. */
function dispatchRAG(
  examId: string,
  materialsText: Array<{ url: string; text: string; fileName: string }>,
  userId: string,
  source: string
) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  fetch(`${baseUrl}/api/internal/process-rag`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
    },
    body: JSON.stringify({ examId, materialsText, userId, source }),
  }).catch((err) => logError("Failed to dispatch RAG", err));
}

export async function createAssignment(data: {
  title: string;
  code: string;
  deadline: string;
  questions: Array<{ id: string; text: string; type: string; options?: string[] }>;
  materials?: string[];
  materials_text?: Array<{ url: string; text: string; fileName: string }>;
  rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
  rubric_public?: boolean;
  chat_weight?: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_folder_id?: string | null;
  assignment_prompt?: string;
  close_at?: string;
  type?: string;
  initial_state?: Record<string, unknown>;
  canvas_config?: Record<string, unknown>;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    // Generate unique exam code (same pattern as createExam)
    let examCode = data.code;
    const { data: existingExam } = await getSupabase()
      .from("exams")
      .select("code")
      .eq("code", examCode)
      .single();

    if (existingExam) {
      const generateExamCode = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
      };

      const MAX_CODE_ATTEMPTS = 10;
      let newCode = generateExamCode();
      let attempts = 0;
      let codeCheck = await getSupabase()
        .from("exams")
        .select("code")
        .eq("code", newCode)
        .maybeSingle();

      while (codeCheck.data !== null) {
        if (++attempts >= MAX_CODE_ATTEMPTS) {
          throw new Error("Failed to generate unique exam code after maximum attempts");
        }
        newCode = generateExamCode();
        codeCheck = await getSupabase()
          .from("exams")
          .select("code")
          .eq("code", newCode)
          .maybeSingle();
      }
      examCode = newCode;
    }

    // Ensure at least one placeholder question for assignments
    const questions = data.questions.length > 0
      ? data.questions
      : [{ id: "assignment-q0", text: "과제", type: "essay" }];

    const examData = {
      title: data.title,
      code: examCode,
      description: null,
      duration: 0, // assignments have no time limit
      questions: questions,
      materials: data.materials || [],
      materials_text: data.materials_text || [],
      rubric: data.rubric || [],
      rubric_public: data.rubric_public || false,
      chat_weight: data.chat_weight ?? 50,
      status: data.status,
      instructor_id: user.id,
      created_at: data.created_at,
      updated_at: data.updated_at,
      type: "assignment",
      deadline: data.deadline,
      assignment_prompt: data.assignment_prompt || null,
    };

    const parentId = data.parent_folder_id || null;

    const MAX_INSERT_RETRIES = 3;
    let rpcResult: { exam: Record<string, unknown> & { id: string }; exam_node: Record<string, unknown> } | null = null;
    let lastInsertError = null;

    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const { data: rpcData, error: rpcError } = await getSupabase()
        .rpc("create_exam_with_node", {
          p_title: examData.title,
          p_code: examData.code,
          p_description: examData.description,
          p_duration: examData.duration,
          p_questions: examData.questions,
          p_materials: examData.materials,
          p_materials_text: examData.materials_text,
          p_rubric: examData.rubric,
          p_rubric_public: examData.rubric_public,
          p_chat_weight: examData.chat_weight,
          p_status: examData.status,
          p_instructor_id: examData.instructor_id,
          p_created_at: examData.created_at,
          p_updated_at: examData.updated_at,
          p_parent_folder_id: parentId,
        });

      if (!rpcError) {
        rpcResult = rpcData as { exam: Record<string, unknown> & { id: string }; exam_node: Record<string, unknown> };
        lastInsertError = null;
        break;
      }

      if (rpcError.code === "23505" && attempt < MAX_INSERT_RETRIES - 1) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let retryCode = "";
        for (let i = 0; i < 6; i++) {
          retryCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        examData.code = retryCode;
        examCode = retryCode;
        continue;
      }

      lastInsertError = rpcError;
      break;
    }

    if (lastInsertError || !rpcResult) {
      logError("[createAssignment] Database error", lastInsertError, { path: "/api/supa/assignment-handlers" });
      return errorJson("DATABASE_ERROR", "Database error", 500);
    }

    const exam = rpcResult.exam;
    const examNode = rpcResult.exam_node;

    // Update type, deadline, and hybrid workspace fields (RPC doesn't know about these)
    const assignmentType = data.type || "assignment";
    await getSupabase()
      .from("exams")
      .update({
        type: assignmentType,
        deadline: examData.deadline,
        close_at: data.close_at || examData.deadline,
        assignment_prompt: examData.assignment_prompt,
        initial_state: data.initial_state || {},
        canvas_config: data.canvas_config || {},
      })
      .eq("id", exam.id);

    // RAG dispatch
    if (
      examData.materials_text &&
      Array.isArray(examData.materials_text) &&
      examData.materials_text.length > 0
    ) {
      await getSupabase()
        .from("exams")
        .update({ rag_status: "pending" })
        .eq("id", exam.id);

      dispatchRAG(
        exam.id,
        examData.materials_text as Array<{ url: string; text: string; fileName: string }>,
        user.id,
        "create_assignment_materials"
      );
    }

    return successJson({
      exam: { ...exam, type: "assignment", deadline: examData.deadline },
      examNode,
    });
  } catch (error) {
    logError("[createAssignment] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("CREATE_ASSIGNMENT_FAILED", "Failed to create assignment", 500);
  }
}

export async function saveCanvas(data: {
  sessionId: string;
  content: string;
  workspace_state?: Record<string, unknown>;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    // Upsert canvas content as q_idx=0 submission
    const upsertData: Record<string, unknown> = {
      session_id: data.sessionId,
      q_idx: 0,
      answer: data.content,
      updated_at: new Date().toISOString(),
    };
    if (data.workspace_state) {
      upsertData.workspace_state = data.workspace_state;
    }

    const { error } = await getSupabase()
      .from("submissions")
      .upsert(upsertData, { onConflict: "session_id,q_idx" });

    if (error) {
      logError("[saveCanvas] DB error", error, { path: "/api/supa/assignment-handlers" });
      return errorJson("SAVE_CANVAS_FAILED", "Failed to save canvas", 500);
    }

    return successJson({ saved: true });
  } catch (error) {
    logError("[saveCanvas] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("SAVE_CANVAS_FAILED", "Failed to save canvas", 500);
  }
}

export async function submitAssignment(data: {
  sessionId: string;
  examId: string;
  studentId: string;
  canvasContent?: string;
  workspace_state?: Record<string, unknown>;
}) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    if (user.id !== data.studentId) {
      return errorJson("FORBIDDEN", "Student ID mismatch", 403);
    }

    // Verify session
    const { data: session, error: sessionError } = await getSupabase()
      .from("sessions")
      .select("id, student_id, submitted_at, exam_id")
      .eq("id", data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorJson("SESSION_NOT_FOUND", "Session not found", 404);
    }

    if (session.student_id !== user.id) {
      return errorJson("FORBIDDEN", "Session does not belong to this user", 403);
    }

    if (session.submitted_at) {
      return errorJson("ALREADY_SUBMITTED", "Already submitted", 409);
    }

    // Save final canvas content if provided
    if (data.canvasContent || data.workspace_state) {
      const submitData: Record<string, unknown> = {
        session_id: data.sessionId,
        q_idx: 0,
        answer: data.canvasContent || "",
        updated_at: new Date().toISOString(),
      };
      if (data.workspace_state) {
        submitData.workspace_state = data.workspace_state;
      }
      await getSupabase()
        .from("submissions")
        .upsert(submitData, { onConflict: "session_id,q_idx" });
    }

    // Update session status
    const now = new Date().toISOString();
    const { error: updateError } = await getSupabase()
      .from("sessions")
      .update({
        status: "submitted",
        submitted_at: now,
      })
      .eq("id", data.sessionId);

    if (updateError) {
      logError("[submitAssignment] Update error", updateError, { path: "/api/supa/assignment-handlers" });
      return errorJson("SUBMIT_FAILED", "Failed to submit assignment", 500);
    }

    // Trigger auto-grading asynchronously
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    fetch(`${baseUrl}/api/grade/auto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ sessionId: data.sessionId }),
    }).catch((err) => logError("Failed to dispatch auto-grade", err));

    return successJson({ submitted: true, submittedAt: now });
  } catch (error) {
    logError("[submitAssignment] Failed", error, { path: "/api/supa/assignment-handlers" });
    return errorJson("SUBMIT_ASSIGNMENT_FAILED", "Failed to submit assignment", 500);
  }
}
