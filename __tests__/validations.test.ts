import { describe, it, expect } from "vitest";
import {
  validateRequest,
  chatRequestSchema,
  adminAuthSchema,
  createExamSchema,
  saveDraftSchema,
  submitExamSchema,
  sessionHeartbeatSchema,
  createFolderSchema,
  gradeUpdateSchema,
} from "@/lib/validations";

describe("validateRequest helper", () => {
  it("returns success with valid data", () => {
    const result = validateRequest(adminAuthSchema, {
      username: "admin",
      password: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("admin");
    }
  });

  it("returns error with invalid data", () => {
    const result = validateRequest(adminAuthSchema, {
      username: "",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("required");
    }
  });

  it("returns error for missing fields", () => {
    const result = validateRequest(adminAuthSchema, {});
    expect(result.success).toBe(false);
  });
});

describe("chatRequestSchema", () => {
  it("validates a valid chat request", () => {
    const result = chatRequestSchema.safeParse({
      message: "Hello",
      sessionId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = chatRequestSchema.safeParse({
      message: "",
      sessionId: "abc-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message exceeding max length", () => {
    const result = chatRequestSchema.safeParse({
      message: "a".repeat(10001),
      sessionId: "abc-123",
    });
    expect(result.success).toBe(false);
  });
});

describe("createExamSchema", () => {
  const validExam = {
    title: "Test Exam",
    code: "ABC123",
    duration: 60,
    questions: [
      { id: "q1", text: "What is 1+1?", type: "essay" as const },
    ],
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("validates a valid exam", () => {
    const result = createExamSchema.safeParse(validExam);
    expect(result.success).toBe(true);
  });

  it("rejects exam without title", () => {
    const result = createExamSchema.safeParse({ ...validExam, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const result = createExamSchema.safeParse({ ...validExam, duration: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts exam with rubric", () => {
    const result = createExamSchema.safeParse({
      ...validExam,
      rubric: [{ evaluationArea: "Logic", detailedCriteria: "Clear reasoning" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("saveDraftSchema", () => {
  it("validates a valid draft", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      questionId: "0",
      answer: "My answer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid session UUID", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "not-a-uuid",
      questionId: "0",
      answer: "My answer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overly long answer", () => {
    const result = saveDraftSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      questionId: "0",
      answer: "a".repeat(100001),
    });
    expect(result.success).toBe(false);
  });
});

describe("gradeUpdateSchema", () => {
  it("validates valid grades", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [
        { q_idx: 0, score: 85, comment: "Good work" },
        { q_idx: 1, score: 100 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects score above 100", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: 0, score: 101 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects score below 0", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: 0, score: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative question index", () => {
    const result = gradeUpdateSchema.safeParse({
      grades: [{ q_idx: -1, score: 50 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("sessionHeartbeatSchema", () => {
  it("validates valid heartbeat", () => {
    const result = sessionHeartbeatSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      studentId: "user_abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty studentId", () => {
    const result = sessionHeartbeatSchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      studentId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("createFolderSchema", () => {
  it("validates folder with null parent", () => {
    const result = createFolderSchema.safeParse({
      name: "My Folder",
      parent_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty folder name", () => {
    const result = createFolderSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
