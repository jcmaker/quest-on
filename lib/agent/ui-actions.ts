/**
 * Quest-On 강사 AI 에이전트 — 클라이언트 UI 액션 프로토콜 (계약)
 *
 * 에이전트(서버 두뇌)와 편집기(클라이언트 손)를 잇는 단일 진실원.
 * 흐름:
 *   1. 에이전트가 UI 액션 배치를 emit → 서버가 pending 으로 저장
 *   2. 클라이언트가 실제 편집기 컨트롤로 실행 + 체화 애니메이션
 *   3. 클라이언트가 실행 결과 + 현재 페이지 상태를 보고 → 서버 루프 재개
 *   4. 에이전트가 finish 호출 → 종료
 *
 * 이 파일을 server 러너/툴, 편집기 액션 실행기, 패널이 공유한다.
 *
 * 주의 — 진짜 DOM 조작이 아니다. 각 액션은 편집기의 실제 React 핸들러로
 * 매핑되며, "조작감"은 체화 피드백 레이어(커서/타자/하이라이트)가 만든다.
 */

import type { AgentRun } from "@/lib/agent/types";

// ── 에이전트가 emit 하는 UI 액션 ─────────────────────────────────
/**
 * 클라이언트가 실제 편집기 컨트롤로 실행하는 액션들.
 * 러너의 LLM 툴셋 = 이 액션들 + finish(아래 참고).
 * finish 는 클라이언트가 실행하는 액션이 아니라 루프 종료 신호이므로
 * 이 유니온에 포함하지 않는다 — 러너가 서버에서 인식해 done=true 로 처리.
 */
export type AgentUiAction =
  | { type: "navigate"; route: string }
  | { type: "set_exam_title"; text: string }
  | { type: "set_topic"; text: string } //            CaseQuestionGenerator 의 freeform 프롬프트
  | { type: "set_question_count"; count: number }
  | { type: "set_difficulty"; difficulty: "basic" | "intermediate" | "advanced" }
  | { type: "generate_questions" } //                 기존 스트리밍 생성 트리거
  | { type: "revise_question"; index: number; instruction: string }
  | { type: "add_question" }
  | { type: "remove_question"; index: number };

export type AgentUiActionType = AgentUiAction["type"];

/** 서버가 각 액션에 부여하는 봉투 — 결과 매칭 + LLM function_call id 대응. */
export interface AgentUiActionEnvelope {
  /** 이 액션 호출의 고유 id. 클라이언트는 결과를 같은 id 로 보고한다. */
  id: string;
  action: AgentUiAction;
}

/** 클라이언트가 한 액션을 실행한 결과. */
export interface AgentUiActionResult {
  /** AgentUiActionEnvelope.id */
  id: string;
  ok: boolean;
  /** 실패 시 사유 (러너가 LLM 에 돌려줘 재시도/대안 유도) */
  error?: string;
}

// ── 에이전트가 보는 페이지/편집기 상태 ───────────────────────────
/**
 * 매 보고(시작 요청 + 모든 action-result)에 동봉되는 현재 상태.
 * 에이전트의 "페이지 보기" — DOM 을 직접 읽는 대신 이 구조화 상태를 본다.
 * 매 턴 최신 상태가 따라오므로 별도 inspect 액션은 두지 않는다.
 */
export interface AgentPageState {
  /** 현재 라우트 (예: "/instructor", "/instructor/new") */
  route: string;
  examTitle: string;
  questionCount: number;
  /** 각 문제의 인덱스 + 유형 + 본문 요약(전체 HTML 아님) */
  questions: Array<{ index: number; type: string; summary: string }>;
  rubricRowCount: number;
  /** 스트리밍 생성이 진행 중인지 */
  isGenerating: boolean;
}

// ── API 계약 ─────────────────────────────────────────────────────
/** POST /api/agent/runs — 루프 시작. */
export interface StartAgentRunRequest {
  prompt: string;
  /** 시작 시점의 페이지 상태 (보통 강사가 패널을 연 페이지) */
  pageState: AgentPageState;
}

/** POST /api/agent/runs/[id]/action-result — 클라가 배치 실행 결과를 보고하고 루프 재개. */
export interface AgentActionResultRequest {
  results: AgentUiActionResult[];
  /** 액션 실행 후의 최신 페이지 상태 */
  pageState: AgentPageState;
}

/** 서버 → 클라 응답 (시작·재개 공통). */
export interface AgentTurnResponse {
  /** 갱신된 런 (steps 포함 — 패널 내레이션용) */
  run: AgentRun;
  /** 클라이언트가 다음에 실행할 액션 배치. done=true 면 비어 있다. */
  pendingActions: AgentUiActionEnvelope[];
  /** true 면 루프 종료 (finish 호출 / 실패 / 취소). */
  done: boolean;
  /** 종료 시 에이전트의 마무리 요약 (finish 의 인자). */
  summary?: string;
}
