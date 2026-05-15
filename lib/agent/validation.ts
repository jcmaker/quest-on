/**
 * Quest-On 강사 AI 에이전트 — API 요청 Zod 스키마
 *
 * /api/agent/* 라우트의 요청 본문 검증 전용.
 * 응답/저장 타입 계약은 lib/agent/types.ts 에 있다 (그 파일은 수정 금지).
 *
 * lib/validations.ts 와 분리해 두는 이유: 다른 작업과의 머지 충돌 방지.
 * validateRequest 헬퍼는 lib/validations.ts 에서 재사용한다.
 */

import { z } from "zod";

import type {
  AgentPageContext,
  ApproveAgentRunRequest,
  AgentRunMessageRequest,
  CreateAgentRunRequest,
  DraftQuestion,
  DraftRubricItem,
  ExamDraftPayload,
} from "@/lib/agent/types";

// ── 페이지 컨텍스트 ─────────────────────────────────────────
const agentPageContextSchema = z.object({
  route: z.string().min(1, "route is required").max(500),
  examId: z.string().max(100).optional(),
  label: z.string().max(500).optional(),
}) satisfies z.ZodType<AgentPageContext>;

// ── POST /api/agent/runs ────────────────────────────────────
export const createAgentRunSchema = z.object({
  type: z.literal("exam_creation"),
  prompt: z.string().min(1, "prompt is required").max(8000),
  pageContext: agentPageContextSchema,
}) satisfies z.ZodType<CreateAgentRunRequest>;

// ── POST /api/agent/runs/[id]/messages ──────────────────────
export const agentRunMessageSchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(8000),
}) satisfies z.ZodType<AgentRunMessageRequest>;

// ── ExamDraftPayload (approve 의 editedDraft) ───────────────
const draftRubricItemSchema = z.object({
  evaluationArea: z.string().max(500),
  detailedCriteria: z.string().max(5000),
}) satisfies z.ZodType<DraftRubricItem>;

const draftQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(50000),
  type: z.string().min(1).max(50),
  rubric: z.array(draftRubricItemSchema).optional(),
}) satisfies z.ZodType<DraftQuestion>;

export const examDraftPayloadSchema = z.object({
  title: z.string().min(1, "title is required").max(500),
  language: z.enum(["ko", "en"]),
  difficulty: z.enum(["basic", "intermediate", "advanced"]),
  durationMinutes: z.number().int().min(0).max(100000),
  questions: z.array(draftQuestionSchema).min(1, "at least one question is required"),
}) satisfies z.ZodType<ExamDraftPayload>;

// ── POST /api/agent/runs/[id]/approve ───────────────────────
export const approveAgentRunSchema = z.object({
  editedDraft: examDraftPayloadSchema.optional(),
}) satisfies z.ZodType<ApproveAgentRunRequest>;
