/**
 * Quest-On 강사 AI 에이전트 — 공유 타입 계약(contract)
 *
 * 이 파일은 에이전트 기능의 단일 진실원(single source of truth)이다.
 * 영속화 계층(lib/agent/store.ts), API 라우트(/api/agent/*),
 * UI(components/agent/*)가 모두 여기서 타입을 가져다 쓴다.
 *
 * MVP 범위: type === "exam_creation" 만 구현.
 * 승인 모델: 전체 draft 후 일괄 승인 (run 레벨 단일 승인).
 * 저장 모델: agent_runs 테이블 1개. steps/input/output 은 JSON 컬럼.
 */

// ── 런(run) 분류 ────────────────────────────────────────────
export type AgentRunType = "exam_creation";
// 향후 확장: "grading_assistant" | "student_reflection" | "integrity_analysis"

export type AgentRunStatus =
  | "queued" //            생성 직후, 아직 루프 시작 전
  | "running" //           에이전트 루프 실행 중
  | "waiting_approval" //  draft 완성, 강사 승인 대기
  | "completed" //         승인 후 커밋 완료
  | "failed" //            오류로 중단
  | "cancelled"; //        강사가 중단을 요청해 종료

export type AgentActorRole = "teacher" | "student" | "admin";

// ── 스텝(step) ──────────────────────────────────────────────
export type AgentStepType =
  | "user_input" //  강사의 최초 요청 또는 수정 요청
  | "plan" //        에이전트의 작업 계획
  | "data_fetch" //  데이터 조회 (자료/컨텍스트)
  | "analysis" //    분석/판단
  | "tool_call" //   툴 실행 (metadata 에 toolName/args/result)
  | "draft" //       draft 산출물 조립
  | "approval" //    승인 이벤트 (run 레벨 승인 시 기록)
  | "final"; //      최종 커밋 결과

export interface AgentStep {
  id: string;
  stepType: AgentStepType;
  /** 한 줄 요약 — UI 타임라인 표시용 */
  title: string;
  /** 상세 내용 — 마크다운 허용 */
  content: string;
  /**
   * 감사 추적의 본체. stepType 별 권장 형태:
   *  - tool_call:   { toolName, args, result }
   *  - data_fetch:  { source, itemCount }
   *  - approval:    { approvedBy, approvedAt, edited }
   */
  metadata?: Record<string, unknown>;
  /** ISO 8601 */
  createdAt: string;
}

// ── 페이지 컨텍스트 ─────────────────────────────────────────
/** 에이전트 패널이 호출 시점에 캡처하는 "강사가 지금 어디 있는가" */
export interface AgentPageContext {
  /** 예: "/instructor", "/instructor/[examId]" */
  route: string;
  /** 시험 상세/편집 페이지일 때 */
  examId?: string;
  /** 사람이 읽는 화면 설명 */
  label?: string;
}

export interface AgentRunInput {
  prompt: string;
  pageContext: AgentPageContext;
}

export interface DraftQuestion {
  id: string;
  /** HTML 본문 */
  text: string;
  /** "essay" 등 */
  type: string;
}

/**
 * 승인 전까지 production 테이블(exams)에 들어가지 않는 draft.
 * agent_runs.output(JSON 컬럼)에 통째로 보관된다. (옵션 A)
 * 승인 시 approve 라우트가 이 payload 를 createExam() 으로 커밋한다.
 * 에이전트 툴은 이 payload 만 만들 뿐, createExam 을 직접 호출하지 않는다.
 */
export interface ExamDraftPayload {
  title: string;
  language: "ko" | "en";
  difficulty: "basic" | "intermediate" | "advanced";
  durationMinutes: number;
  questions: DraftQuestion[];
}

// ── 런(run) ─────────────────────────────────────────────────
/** API/UI 가 다루는 공개 런 형태. 러너 내부 필드(lib/agent/store.ts)는 제외. */
export interface AgentRun {
  id: string;
  type: AgentRunType;
  /** Clerk user id — 소유권 체크 기준 */
  actorId: string;
  actorRole: AgentActorRole;
  status: AgentRunStatus;
  /** 사람이 읽는 런 제목 */
  title: string | null;
  input: AgentRunInput;
  steps: AgentStep[];
  /** waiting_approval / completed 상태에서 채워짐 */
  output: ExamDraftPayload | null;
  /** 승인 커밋 후 생성된 exams.id */
  examId: string | null;
  error: string | null;
  tokensUsed: number;
  costUsdMicros: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

// ── API 계약 ────────────────────────────────────────────────
/** POST /api/agent/runs */
export interface CreateAgentRunRequest {
  type: AgentRunType;
  prompt: string;
  pageContext: AgentPageContext;
}

/** POST /api/agent/runs/[id]/messages — waiting_approval 상태에서 수정 요청 */
export interface AgentRunMessageRequest {
  prompt: string;
}

/** POST /api/agent/runs/[id]/approve — 강사가 검토 중 직접 수정했다면 editedDraft 동봉 */
export interface ApproveAgentRunRequest {
  editedDraft?: ExamDraftPayload;
}

/** 단건 응답: GET /api/agent/runs/[id], POST /api/agent/runs, .../messages, .../approve */
export interface AgentRunResponse {
  run: AgentRun;
}

/** 목록 응답: GET /api/agent/runs */
export interface AgentRunListResponse {
  runs: AgentRun[];
}
