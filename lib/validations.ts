import { z } from "zod";

// Reusable field schemas
const uuid = z.string().uuid();
const sessionId = z.string().uuid("Invalid session ID format");

// Chat API
export const chatRequestSchema = z.object({
  message: z.string().min(1, "Message is required").max(10000, "Message too long"),
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
  message: z.string().min(1, "Message is required").max(10000, "Message too long"),
  sessionId: z.string().min(1),
  context: z.string().min(1, "Context is required"),
  scopeDescription: z.string().optional(),
  userId: z.string().optional(),
});

// Submission Reply API
export const submissionReplySchema = z.object({
  studentReply: z.string().min(1, "Student reply is required").max(100000),
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
  message: z.string().min(1).max(10000),
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
      comment: z.string().max(5000).optional(),
    })
  ),
});

// Supa route action schema
export const supaActionSchema = z.object({
  action: z.string().min(1),
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
