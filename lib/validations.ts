import { z } from "zod";
import { sanitizeUserInput } from "@/lib/sanitize";

// Reusable field schemas
const uuid = z.string().uuid();
const sessionId = z.string().uuid("Invalid session ID format");

// Sanitized string: strips XSS vectors at validation time
const sanitizedString = (schema: z.ZodString) => schema.transform(sanitizeUserInput);

// ========== Exam JSON Column Schemas ==========
// These validate the JSON stored in exams.questions, exams.rubric, exams.materials

export const examQuestionItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  text: z.string().optional(),
  prompt: z.string().optional(),
  type: z.string().optional(),
  idx: z.number().optional(),
  ai_context: z.string().optional().nullable(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
}).passthrough();

export const examQuestionsSchema = z.array(examQuestionItemSchema);

export const examRubricItemSchema = z.object({
  evaluationArea: z.string(),
  detailedCriteria: z.string(),
}).passthrough();

export const examRubricSchema = z.array(examRubricItemSchema);

export const examMaterialsSchema = z.array(z.string());

/** Safely parse JSON column with Zod schema, returning fallback on failure */
export function safeParseJson<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.warn("[safeParseJson] Validation failed:", result.error.errors[0]?.message);
  return fallback;
}

// Chat API
export const chatRequestSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000, "Message too long")),
  sessionId: z.string().min(1, "Session ID is required"),
  questionId: z.string().optional(),
  questionIdx: z.union([z.number(), z.string()]).optional(),
  examTitle: z.string().optional(),
  examCode: z.string().optional(),
  examId: z.string().optional(),
  studentId: z.string().optional(),
  currentQuestionText: z.string().optional(),
  currentQuestionAiContext: z.string().optional(),
});

// Instructor Chat API
export const instructorChatRequestSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000, "Message too long")),
  sessionId: z.string().min(1),
  context: z.string().min(1, "Context is required"),
  scopeDescription: z.string().optional(),
  userId: z.string().optional(),
});

// Submission Reply API
export const submissionReplySchema = z.object({
  studentReply: sanitizedString(z.string().min(1, "Student reply is required").max(100000)),
  sessionId: sessionId,
  qIdx: z.number().int().min(0),
});

// Paste Log API
export const pasteLogSchema = z.object({
  length: z.number().optional(),
  pasted_text: z.string().max(50000).optional(),
  paste_start: z.number().optional().nullable(),
  paste_end: z.number().optional().nullable(),
  answer_length_before: z.number().optional().nullable(),
  isInternal: z.boolean().optional(),
  ts: z.union([z.string(), z.number()]),
  examCode: z.string().optional(),
  questionId: z.string().optional(),
  sessionId: sessionId,
});

// Admin Auth API
export const adminAuthSchema = z.object({
  username: z.string().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

// Feedback API
export const feedbackRequestSchema = z.object({
  message: sanitizedString(z.string().min(1).max(10000)),
  examCode: z.string().min(1),
  studentId: z.string().min(1),
  sessionId: z.string().optional(),
  questionIdx: z.number().int().min(0).optional(),
});

// Grade API
export const gradeUpdateSchema = z.object({
  grades: z.array(
    z.object({
      q_idx: z.number().int().min(0),
      score: z.number().min(0).max(100),
      comment: z.string().max(5000).optional().transform(v => v ? sanitizeUserInput(v) : v),
    })
  ),
});

// Supa route action schema
export const supaActionSchema = z.object({
  action: z.string().min(1),
});

// ========== Supa Route Action Schemas ==========

// Exam creation/update
export const createExamSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  code: z.string().min(1).max(20),
  duration: z.number().int().min(0),
  questions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    type: z.enum(["multiple-choice", "essay", "short-answer"]),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().optional(),
  })),
  materials: z.array(z.string()).optional(),
  materials_text: z.array(z.object({
    url: z.string(),
    text: z.string(),
    fileName: z.string(),
  })).optional(),
  rubric: z.array(z.object({
    evaluationArea: z.string(),
    detailedCriteria: z.string(),
  })).optional(),
  rubric_public: z.boolean().optional(),
  status: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  parent_folder_id: z.string().nullable().optional(),
});

export const updateExamSchema = z.object({
  id: z.string().uuid("Invalid exam ID"),
  update: z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(2000).nullable().optional(),
    duration: z.number().int().min(0).optional(),
    questions: z.unknown().optional(),
    rubric: z.unknown().optional(),
    rubric_public: z.boolean().optional(),
    materials: z.array(z.string()).optional(),
    materials_text: z.array(z.object({
      url: z.string(),
      text: z.string(),
      fileName: z.string(),
    })).optional(),
    status: z.string().optional(),
    code: z.string().min(1).max(20).optional(),
    chat_weight: z.number().min(0).max(100).nullable().optional(),
    open_at: z.string().nullable().optional(),
    close_at: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    allow_draft_in_waiting: z.boolean().optional(),
    allow_chat_in_waiting: z.boolean().optional(),
    updated_at: z.string().optional(),
  }).strict(),
});

// Session operations
export const initExamSessionSchema = z.object({
  examCode: z.string().min(1, "Exam code is required").max(20),
  studentId: z.string().min(1, "Student ID is required"),
  deviceFingerprint: z.string().optional(),
});

export const createOrGetSessionSchema = z.object({
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

export const sessionHeartbeatSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

export const deactivateSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  studentId: z.string().min(1, "Student ID is required"),
});

// Draft operations
export const saveDraftSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  questionId: z.string().min(1),
  answer: sanitizedString(z.string().max(100000, "Answer too long")),
});

export const saveAllDraftsSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  drafts: z.array(z.object({
    questionId: z.string(),
    text: z.string().max(100000).transform(sanitizeUserInput),
  })),
});

export const saveDraftAnswersSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  answers: z.array(z.object({
    questionId: z.string(),
    text: z.string().max(100000).transform(sanitizeUserInput),
  })),
});

// Exam submission
export const submitExamSchema = z.object({
  examId: z.string().uuid("Invalid exam ID"),
  studentId: z.string().min(1),
  sessionId: z.string().uuid("Invalid session ID"),
  answers: z.array(z.unknown()),
  chatHistory: z.array(z.unknown()).optional(),
  feedback: z.string().optional(),
  feedbackResponses: z.array(z.unknown()).optional(),
});

// Drive operations
export const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(255),
  parent_id: z.string().uuid().nullable().optional(),
});

export const moveNodeSchema = z.object({
  node_id: z.string().uuid("Invalid node ID"),
  new_parent_id: z.string().uuid().nullable().optional(),
  new_sort_order: z.number().int().min(0).optional(),
});

export const deleteNodeSchema = z.object({
  node_id: z.string().uuid("Invalid node ID"),
});

export const copyExamSchema = z.object({
  exam_id: z.string().uuid("Invalid exam ID"),
});

// Feedback chat
export const feedbackChatSchema = z.object({
  message: sanitizedString(z.string().min(1, "Message is required").max(10000)),
  sessionId: z.string().min(1),
  qIdx: z.number().int().min(0),
  chatHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
  examCode: z.string().optional(),
  studentId: z.string().optional(),
});

// AI Case Question Generation
export const generateCaseQuestionsSchema = z.object({
  examTitle: z.string().min(1).max(500),
  topics: z.string().max(500).optional(),
  difficulty: z.enum(["basic", "intermediate", "advanced"]).default("intermediate"),
  questionCount: z.number().int().min(1).max(5).default(2),
  customInstructions: z.string().max(2000).optional(),
  materialsText: z.array(z.object({
    url: z.string(),
    text: z.string(),
    fileName: z.string(),
  })).optional(),
  existingRubric: z.array(examRubricItemSchema).optional(),
});

// AI Case Question Adjustment
export const adjustCaseQuestionSchema = z.object({
  questionText: z.string().min(1),
  instruction: z.string().min(1).max(2000),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
  examTitle: z.string().optional(),
});

// Helper to validate and return typed result or error response
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: firstError
        ? `${firstError.path.join(".")}: ${firstError.message}`
        : "Invalid request body",
    };
  }
  return { success: true, data: result.data };
}
