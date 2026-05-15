/**
 * Quest-On 강사 AI 에이전트 — 툴 레지스트리
 *
 * 에이전트 루프(lib/agent/runner.ts)가 OpenAI function calling 으로 호출하는 툴들.
 * 각 툴은 { name, description, parameters(OpenAI JSON schema), execute, terminal? }.
 *
 * 설계 원칙:
 *  - 툴은 순수 비즈니스 로직만 수행한다. 영속화(스텝 추가/상태 전환)는 러너 책임.
 *  - OpenAI 호출은 전부 callTrackedChatCompletion 으로 감싸 ai_events 에 비용 추적.
 *  - assemble_exam_draft 는 terminal 툴: payload 유효성만 검증해 반환하고,
 *    output 저장 + status 전환은 러너가 한다.
 */

import type OpenAI from "openai";

import { AI_MODEL, AI_MODEL_HEAVY, getOpenAI } from "@/lib/openai";
import { buildAiTextMetadata, callTrackedChatCompletion } from "@/lib/ai-tracking";
import {
  buildCaseQuestionAdjustmentPrompt,
  buildCaseQuestionGenerationPrompt,
} from "@/lib/prompts";
import type {
  DraftQuestion,
  DraftRubricItem,
  ExamDraftPayload,
} from "@/lib/agent/types";

// ── 컨텍스트 ─────────────────────────────────────────────────
/** 러너가 각 툴 실행 시 넘기는 실행 컨텍스트. */
export interface ToolContext {
  runId: string;
  /** Clerk user id — ai_events 의 user_id 로 기록 */
  userId: string;
}

/** 한 번의 툴 실행 결과 — 러너가 누적 비용/스텝에 반영한다. */
export interface ToolExecutionResult {
  /** OpenAI 에 다시 돌려줄, 그리고 스텝 metadata 에 남길 결과 페이로드 */
  result: unknown;
  /** 이번 실행에서 소비한 토큰 수 (없으면 0) */
  tokensUsed: number;
  /** 이번 실행에서 추정된 비용 (USD micros, 없으면 0) */
  costUsdMicros: number;
}

export interface AgentTool {
  name: string;
  description: string;
  /** OpenAI function calling JSON schema */
  parameters: Record<string, unknown>;
  /** true 면 러너가 이 툴 실행 후 루프를 종료한다. */
  terminal?: boolean;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext
  ) => Promise<ToolExecutionResult>;
}

const AGENT_ROUTE = "/api/agent/runs";

// ── 헬퍼 ─────────────────────────────────────────────────────
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

/** JSON mode 응답 본문을 파싱한다. 비어 있거나 깨지면 throw. */
function parseJsonContent(completion: ChatCompletion): Record<string, unknown> {
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI 응답이 비어 있습니다.");
  }
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("AI 응답이 객체가 아닙니다.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `AI 응답을 파싱할 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asLanguage(value: unknown): "ko" | "en" {
  return value === "en" ? "en" : "ko";
}

function asDifficulty(
  value: unknown
): "basic" | "intermediate" | "advanced" {
  return value === "basic" || value === "advanced" ? value : "intermediate";
}

/** AI 응답의 rubric 배열을 DraftRubricItem[] 로 정규화한다. */
function normalizeRubric(value: unknown): DraftRubricItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      evaluationArea: asString(item.evaluationArea),
      detailedCriteria: asString(item.detailedCriteria),
    }))
    .filter((item) => item.evaluationArea.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── 툴 1: generate_questions ─────────────────────────────────
const generateQuestionsTool: AgentTool = {
  name: "generate_questions",
  description:
    "시험 주제/제목, 난이도, 문항 수에 맞춰 사례형(case-based) 시험 문제를 생성한다. " +
    "각 문제는 HTML 본문과 문제별 루브릭 초안을 포함한다. assemble_exam_draft 보다 먼저 호출해야 한다.",
  parameters: {
    type: "object",
    properties: {
      examTitle: {
        type: "string",
        description: "시험 제목 또는 주제",
      },
      difficulty: {
        type: "string",
        enum: ["basic", "intermediate", "advanced"],
        description: "문제 난이도",
      },
      questionCount: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "생성할 문제 수",
      },
      topics: {
        type: "string",
        description: "다룰 세부 토픽 (선택)",
      },
      customInstructions: {
        type: "string",
        description: "문제 유형/형식 등에 대한 추가 지시 (선택)",
      },
      language: {
        type: "string",
        enum: ["ko", "en"],
        description: "문제 작성 언어 (기본값 ko)",
      },
    },
    required: ["examTitle", "difficulty", "questionCount"],
  },
  async execute(args, ctx): Promise<ToolExecutionResult> {
    const examTitle = asString(args.examTitle).trim();
    if (!examTitle) {
      throw new Error("generate_questions: examTitle 이 필요합니다.");
    }
    const difficulty = asDifficulty(args.difficulty);
    const rawCount =
      typeof args.questionCount === "number" ? args.questionCount : 1;
    const questionCount = Math.min(10, Math.max(1, Math.floor(rawCount)));
    const language = asLanguage(args.language);
    const topics = asString(args.topics) || undefined;
    const customInstructions = asString(args.customInstructions) || undefined;

    const { system, user } = buildCaseQuestionGenerationPrompt({
      examTitle,
      difficulty,
      questionCount,
      topics,
      customInstructions,
      language,
      generationMode: "case",
    });

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL_HEAVY,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "instructor_agent",
        route: AGENT_ROUTE,
        model: AI_MODEL_HEAVY,
        userId: ctx.userId,
        metadata: buildAiTextMetadata({
          inputText: [system, user],
          extra: {
            agent_tool: "generate_questions",
            run_id: ctx.runId,
            question_count: questionCount,
            difficulty,
          },
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as ChatCompletion).choices?.[0]?.message?.content ?? null,
          }),
      }
    );

    const parsed = parseJsonContent(tracked.data);
    const rawQuestions = Array.isArray(parsed.questions)
      ? parsed.questions
      : [];
    if (rawQuestions.length === 0) {
      throw new Error("generate_questions: AI 가 문제를 생성하지 못했습니다.");
    }

    const questions: DraftQuestion[] = rawQuestions
      .filter((q): q is Record<string, unknown> => isRecord(q))
      .map((q) => ({
        id: crypto.randomUUID(),
        text: asString(q.text),
        type: asString(q.type, "essay"),
        rubric: normalizeRubric(q.rubric),
      }))
      .filter((q) => q.text.length > 0);

    if (questions.length === 0) {
      throw new Error("generate_questions: 유효한 문제가 없습니다.");
    }

    return {
      result: { questions },
      tokensUsed: tracked.usage?.totalTokens ?? 0,
      costUsdMicros: tracked.estimatedCostUsdMicros,
    };
  },
};

// ── 툴 2: revise_question ────────────────────────────────────
const reviseQuestionTool: AgentTool = {
  name: "revise_question",
  description:
    "강사의 수정 지시에 따라 기존 문제 1개를 수정한다. 수정된 HTML 본문을 반환한다.",
  parameters: {
    type: "object",
    properties: {
      questionText: {
        type: "string",
        description: "수정 대상 문제의 현재 HTML 본문",
      },
      instruction: {
        type: "string",
        description: "어떻게 수정할지에 대한 지시",
      },
      examTitle: {
        type: "string",
        description: "시험 제목 (맥락용, 선택)",
      },
      language: {
        type: "string",
        enum: ["ko", "en"],
        description: "작성 언어 (기본값 ko)",
      },
    },
    required: ["questionText", "instruction"],
  },
  async execute(args, ctx): Promise<ToolExecutionResult> {
    const questionText = asString(args.questionText).trim();
    if (!questionText) {
      throw new Error("revise_question: questionText 가 필요합니다.");
    }
    const instruction = asString(args.instruction).trim();
    if (!instruction) {
      throw new Error("revise_question: instruction 이 필요합니다.");
    }
    const language = asLanguage(args.language);
    const examTitle = asString(args.examTitle) || undefined;

    const { system, user } = buildCaseQuestionAdjustmentPrompt({
      currentQuestionText: questionText,
      instruction,
      examTitle,
      language,
      generationMode: "case",
    });

    const tracked = await callTrackedChatCompletion(
      () =>
        getOpenAI().chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      {
        feature: "instructor_agent",
        route: AGENT_ROUTE,
        model: AI_MODEL,
        userId: ctx.userId,
        metadata: buildAiTextMetadata({
          inputText: [system, user],
          extra: {
            agent_tool: "revise_question",
            run_id: ctx.runId,
          },
        }),
      },
      {
        metadataBuilder: (result) =>
          buildAiTextMetadata({
            outputText:
              (result as ChatCompletion).choices?.[0]?.message?.content ?? null,
          }),
      }
    );

    const parsed = parseJsonContent(tracked.data);
    const revisedText = asString(parsed.questionText).trim();
    if (!revisedText) {
      throw new Error("revise_question: 수정된 문제 본문이 비어 있습니다.");
    }

    return {
      result: {
        questionText: revisedText,
        explanation: asString(parsed.explanation),
      },
      tokensUsed: tracked.usage?.totalTokens ?? 0,
      costUsdMicros: tracked.estimatedCostUsdMicros,
    };
  },
};

// ── 툴 3: assemble_exam_draft (terminal) ─────────────────────
/** assemble_exam_draft 인자를 ExamDraftPayload 로 검증·정규화한다. */
function validateExamDraft(args: Record<string, unknown>): ExamDraftPayload {
  const title = asString(args.title).trim();
  if (!title) {
    throw new Error("assemble_exam_draft: title 이 필요합니다.");
  }

  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
  if (rawQuestions.length === 0) {
    throw new Error("assemble_exam_draft: 문제가 1개 이상 필요합니다.");
  }

  const questions: DraftQuestion[] = rawQuestions
    .filter((q): q is Record<string, unknown> => isRecord(q))
    .map((q) => {
      const text = asString(q.text).trim();
      if (!text) {
        throw new Error("assemble_exam_draft: 빈 문제 본문이 있습니다.");
      }
      return {
        id: asString(q.id) || crypto.randomUUID(),
        text,
        type: asString(q.type, "essay"),
        rubric: normalizeRubric(q.rubric),
      };
    });

  if (questions.length === 0) {
    throw new Error("assemble_exam_draft: 유효한 문제가 없습니다.");
  }

  const rawDuration =
    typeof args.durationMinutes === "number" ? args.durationMinutes : 60;
  const durationMinutes = Math.min(
    600,
    Math.max(1, Math.floor(rawDuration))
  );

  return {
    title,
    language: asLanguage(args.language),
    difficulty: asDifficulty(args.difficulty),
    durationMinutes,
    questions,
  };
}

const assembleExamDraftTool: AgentTool = {
  name: "assemble_exam_draft",
  description:
    "생성·검토가 끝난 문제들을 최종 시험 draft 로 조립한다. 이 툴을 호출하면 " +
    "에이전트 턴이 종료되고 강사 승인 대기 상태로 전환된다. 모든 문제와 루브릭이 " +
    "준비된 뒤 마지막에 한 번만 호출하라.",
  terminal: true,
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "시험 제목",
      },
      language: {
        type: "string",
        enum: ["ko", "en"],
        description: "시험 언어",
      },
      difficulty: {
        type: "string",
        enum: ["basic", "intermediate", "advanced"],
        description: "시험 난이도",
      },
      durationMinutes: {
        type: "integer",
        minimum: 1,
        maximum: 600,
        description: "시험 시간(분)",
      },
      questions: {
        type: "array",
        description: "완성된 문제 목록",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "문제 id (없으면 자동 생성)" },
            text: { type: "string", description: "문제 본문 HTML" },
            type: { type: "string", description: "문제 유형 (예: essay)" },
            rubric: {
              type: "array",
              description: "문제별 루브릭",
              items: {
                type: "object",
                properties: {
                  evaluationArea: { type: "string" },
                  detailedCriteria: { type: "string" },
                },
                required: ["evaluationArea", "detailedCriteria"],
              },
            },
          },
          required: ["text"],
        },
      },
    },
    required: ["title", "language", "difficulty", "durationMinutes", "questions"],
  },
  async execute(args): Promise<ToolExecutionResult> {
    // 터미널 툴: 유효성만 검증해 draft 를 반환한다.
    // output 저장 + status 전환은 러너의 책임이다.
    const draft = validateExamDraft(args);
    return {
      result: { draft },
      tokensUsed: 0,
      costUsdMicros: 0,
    };
  },
};

// ── 레지스트리 ───────────────────────────────────────────────
export const AGENT_TOOLS: AgentTool[] = [
  generateQuestionsTool,
  reviseQuestionTool,
  assembleExamDraftTool,
];

const TOOL_BY_NAME: Map<string, AgentTool> = new Map(
  AGENT_TOOLS.map((tool) => [tool.name, tool])
);

export function getAgentTool(name: string): AgentTool | undefined {
  return TOOL_BY_NAME.get(name);
}

/** OpenAI chat.completions 의 tools 파라미터로 넘길 함수 정의 배열. */
export function getOpenAIToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return AGENT_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
