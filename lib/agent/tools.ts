/**
 * Quest-On 강사 AI 에이전트 — 툴 선언 (declarations only)
 *
 * 재개형(resumable) 클라이언트-인터랙티브 루프 모델:
 *  - 에이전트(서버 LLM 두뇌)는 UI 액션을 emit 할 뿐 직접 실행하지 않는다.
 *  - 실제 실행은 클라이언트(편집기)가 하고, 결과를 다시 보고한다.
 *
 * 따라서 이 파일에는 **서버 실행 로직이 없다**. 각 툴은 OpenAI Responses API
 * function calling 으로 노출할 { name, description, parameters(JSON schema) }
 * 선언만 담는다. 러너는 LLM 의 tool call 을 수집해 pendingActions 로 넘긴다.
 *
 * 툴셋 = lib/agent/ui-actions.ts 의 AgentUiAction 타입들 + finish.
 * finish 는 클라이언트가 실행하는 액션이 아니라 루프 종료 신호다 — 러너가
 * 서버에서 인식해 done=true 로 처리한다(AgentUiAction 유니온에는 없음).
 */

import type OpenAI from "openai";

import type { AgentUiActionType } from "@/lib/agent/ui-actions";

// ── 툴 선언 형태 ─────────────────────────────────────────────
/** UI 액션 타입 + 루프 종료용 finish. */
export type AgentToolName = AgentUiActionType | "finish";

/** 순수 선언 — 서버 실행 로직 없음. */
export interface AgentToolDeclaration {
  name: AgentToolName;
  description: string;
  /** OpenAI function calling JSON schema */
  parameters: Record<string, unknown>;
}

// ── 툴 선언 ──────────────────────────────────────────────────
const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export const AGENT_TOOLS: AgentToolDeclaration[] = [
  {
    name: "navigate",
    description:
      "강사를 다른 페이지로 이동시킨다. 시험을 새로 만들려면 시험 생성 페이지로 먼저 이동해야 한다.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "이동할 라우트 경로 (예: '/instructor', '/instructor/new')",
        },
      },
      required: ["route"],
      additionalProperties: false,
    },
  },
  {
    name: "set_exam_title",
    description: "시험 편집기의 시험 제목 입력란에 제목을 입력한다.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "시험 제목" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "set_topic",
    description:
      "문제 생성기의 자유 서술 프롬프트(주제/세부 토픽)를 입력한다. " +
      "generate_questions 가 이 주제를 바탕으로 문제를 만든다.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "시험 주제 또는 세부 토픽 설명",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "set_question_count",
    description: "생성할 문항 수를 설정한다.",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "문항 수 (1~10)",
        },
      },
      required: ["count"],
      additionalProperties: false,
    },
  },
  {
    name: "set_difficulty",
    description: "문제 난이도를 설정한다.",
    parameters: {
      type: "object",
      properties: {
        difficulty: {
          type: "string",
          enum: ["basic", "intermediate", "advanced"],
          description: "문제 난이도",
        },
      },
      required: ["difficulty"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_questions",
    description:
      "현재 설정된 주제/난이도/문항 수로 문제 스트리밍 생성을 시작한다. " +
      "set_topic / set_question_count / set_difficulty 를 먼저 설정한 뒤 호출하라.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    name: "revise_question",
    description:
      "이미 생성된 문제 1개를 강사의 지시에 맞게 수정한다. 0부터 시작하는 인덱스로 대상 문제를 지정한다.",
    parameters: {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 0,
          description: "수정할 문제의 0-기반 인덱스",
        },
        instruction: {
          type: "string",
          description: "어떻게 수정할지에 대한 지시",
        },
      },
      required: ["index", "instruction"],
      additionalProperties: false,
    },
  },
  {
    name: "add_question",
    description: "시험에 빈 문제를 1개 추가한다.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    name: "remove_question",
    description:
      "시험에서 문제 1개를 제거한다. 0부터 시작하는 인덱스로 대상 문제를 지정한다.",
    parameters: {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 0,
          description: "제거할 문제의 0-기반 인덱스",
        },
      },
      required: ["index"],
      additionalProperties: false,
    },
  },
  {
    name: "finish",
    description:
      "모든 작업이 끝났을 때 호출해 에이전트 루프를 종료한다. summary 에 강사에게 보여줄 마무리 요약을 담는다.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "강사에게 보여줄 작업 마무리 요약",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set<string>(AGENT_TOOLS.map((tool) => tool.name));

/** name 이 알려진 에이전트 툴인지 검사한다. */
export function isAgentToolName(name: string): name is AgentToolName {
  return TOOL_NAMES.has(name);
}

/**
 * OpenAI Responses API 의 `tools` 파라미터로 넘길 function tool 정의 배열.
 * Responses API 의 FunctionTool 은 chat.completions 와 달리 `function` 래퍼가
 * 없는 평탄한 형태다 ({ type, name, description, parameters, strict }).
 */
export function getOpenAIToolDefinitions(): OpenAI.Responses.FunctionTool[] {
  return AGENT_TOOLS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
}
