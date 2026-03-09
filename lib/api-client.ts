/**
 * Typed API client for /api/supa endpoint.
 * Wraps fetch calls with type-safe functions and consistent error handling.
 * When RESTful routes are introduced, only internal implementation needs to change.
 */

interface ApiError {
  error: string;
  message?: string;
  details?: string;
}

async function supaAction<T = unknown>(
  action: string,
  data?: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const response = await fetch("/api/supa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorData: ApiError = { error: "Unknown error" };
    try {
      const text = await response.text();
      if (text) errorData = JSON.parse(text);
    } catch {
      errorData = { error: `서버 오류 (${response.status}): ${response.statusText}` };
    }
    throw new Error(errorData.message || errorData.error || errorData.details || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

// ========== Exam Actions ==========

export const api = {
  exam: {
    create: (data: {
      title: string;
      code: string;
      duration: number;
      questions: unknown[];
      materials?: string[];
      materials_text?: Array<{ url: string; text: string; fileName: string }>;
      rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
      rubric_public?: boolean;
      status: string;
      created_at: string;
      updated_at: string;
      parent_folder_id?: string | null;
    }) => supaAction<{ exam: unknown; examNode: unknown }>("create_exam", data),

    getByCode: (code: string, options?: { signal?: AbortSignal }) =>
      supaAction<{ exam: unknown }>("get_exam", { code }, options),

    getById: (id: string, options?: { signal?: AbortSignal }) =>
      supaAction<{ exam: unknown }>("get_exam_by_id", { id }, options),

    update: (id: string, update: Record<string, unknown>) =>
      supaAction<{ exam: unknown }>("update_exam", { id, update }),

    copy: (exam_id: string) =>
      supaAction<{ exam: unknown; examNode: unknown }>("copy_exam", { exam_id }),

    getInstructorExams: (options?: { signal?: AbortSignal }) =>
      supaAction<{ exams: unknown[] }>("get_instructor_exams", undefined, options),
  },

  session: {
    createOrGet: (examId: string, studentId: string) =>
      supaAction<{ session: unknown; messages: unknown[] }>("create_or_get_session", { examId, studentId }),

    init: (data: { examCode: string; studentId: string; deviceFingerprint?: string }, options?: { signal?: AbortSignal }) =>
      supaAction<{
        exam: unknown;
        session: unknown;
        messages: unknown[];
        sessionStartTime?: string;
        timeRemaining?: number | null;
        sessionStatus?: string;
        gateStarted?: boolean;
        isRetakeBlocked?: boolean;
        autoSubmitted?: boolean;
        timeExpired?: boolean;
      }>("init_exam_session", data, options),

    heartbeat: (sessionId: string, studentId: string) =>
      supaAction<{ timeRemaining?: number | null; submitted?: boolean; timeExpired?: boolean; autoSubmitted?: boolean }>(
        "session_heartbeat",
        { sessionId, studentId }
      ),

    deactivate: (sessionId: string, studentId: string) =>
      supaAction("deactivate_session", { sessionId, studentId }),

    getSubmissions: (sessionId: string, options?: { signal?: AbortSignal }) =>
      supaAction<{ submissions: unknown[] }>("get_session_submissions", { sessionId }, options),

    getMessages: (sessionId: string, options?: { signal?: AbortSignal }) =>
      supaAction<{ messages: unknown[] }>("get_session_messages", { sessionId }, options),

    submit: (data: {
      examId: string;
      studentId: string;
      sessionId: string;
      answers: unknown[];
      chatHistory?: unknown[];
      feedback?: string;
      feedbackResponses?: unknown[];
    }) => supaAction<{ session: unknown; submissions: unknown[]; compressionStats: unknown }>("submit_exam", data),
  },

  draft: {
    save: (sessionId: string, questionId: string, answer: string) =>
      supaAction<{ submission: unknown }>("save_draft", { sessionId, questionId, answer }),

    saveAll: (sessionId: string, drafts: Array<{ questionId: string; text: string }>) =>
      supaAction<{ submissions: unknown[] }>("save_all_drafts", { sessionId, drafts }),

    saveAnswers: (sessionId: string, answers: Array<{ questionId: string; text: string }>) =>
      supaAction<{ submissions: unknown[] }>("save_draft_answers", { sessionId, answers }),
  },

  drive: {
    getRoot: (options?: { signal?: AbortSignal }) =>
      supaAction<{ nodes: unknown[] }>("get_instructor_drive", undefined, options),

    getFolderContents: (folder_id: string | null, options?: { signal?: AbortSignal }) =>
      supaAction<{ nodes: unknown[] }>("get_folder_contents", { folder_id }, options),

    getBreadcrumb: (folder_id: string, options?: { signal?: AbortSignal }) =>
      supaAction<{ breadcrumb: Array<{ id: string; name: string }> }>("get_breadcrumb", { folder_id }, options),

    createFolder: (name: string, parent_id?: string | null) =>
      supaAction<{ folder: unknown }>("create_folder", { name, parent_id }),

    moveNode: (node_id: string, new_parent_id?: string | null, new_sort_order?: number) =>
      supaAction<{ node: unknown }>("move_node", { node_id, new_parent_id, new_sort_order }),

    updateNode: (node_id: string, name?: string) =>
      supaAction<{ node: unknown }>("update_node", { node_id, name }),

    deleteNode: (node_id: string) =>
      supaAction("delete_node", { node_id }),
  },
} as const;
