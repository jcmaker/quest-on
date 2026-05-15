"use client";

/**
 * AgentPanel — 강사용 AI 에이전트 플로팅 채팅 패널.
 *
 * 강사 레이아웃에 한 번만 마운트되어 모든 강사 페이지에 떠 있다.
 * 네비게이션 사이드바(SidebarProvider)와 충돌하지 않도록
 * shadcn Sidebar 가 아닌 자체 fixed-position 오버레이로 구현한다.
 *
 * 상태 흐름 (lib/agent/types.ts 의 AgentRunStatus):
 *   idle(런 없음) → queued/running(폴링) → waiting_approval(검토) → completed/failed
 *   queued/running 중 강사가 중단하면 → cancelled
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { qk } from "@/lib/query-keys";
import { useAgentPageContext } from "@/hooks/use-agent-page-context";
import {
  approveAgentRun,
  cancelAgentRun,
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  sendAgentRunMessage,
} from "@/lib/agent/client";
import type { AgentRun, AgentRunStatus } from "@/lib/agent/types";
import { AgentStepTimeline } from "@/components/agent/AgentStepTimeline";
import { AgentDraftReview } from "@/components/agent/AgentDraftReview";

/** queued/running 일 때만 폴링 */
const POLL_INTERVAL_MS = 1500;

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "대기 중",
  running: "실행 중",
  waiting_approval: "승인 대기",
  completed: "완료",
  failed: "실패",
  cancelled: "중단됨",
};

const STATUS_BADGE: Record<
  AgentRunStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "secondary",
  running: "secondary",
  waiting_approval: "default",
  completed: "default",
  failed: "destructive",
  // cancelled 는 오류(빨강)와 구분 — 중립적인 회색(outline)
  cancelled: "outline",
};

function isActiveStatus(status: AgentRunStatus): boolean {
  return status === "queued" || status === "running";
}

export default function AgentPanel() {
  const [open, setOpen] = useState(false);
  /** 현재 보고 있는 런 ID. null 이면 idle 화면(입력 + 최근 런 목록). */
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  return (
    <>
      {!open && <FloatingTrigger onOpen={() => setOpen(true)} />}
      {open && (
        <AgentDrawer
          onClose={() => setOpen(false)}
          activeRunId={activeRunId}
          setActiveRunId={setActiveRunId}
        />
      )}
    </>
  );
}

/* ── 플로팅 트리거 버튼 ─────────────────────────────────────── */

function FloatingTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimateIcon animateOnHover="path-loop" loop asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label="AI 에이전트 열기"
          className="gradient-animated flex h-14 w-14 items-center justify-center rounded-3xl rounded-br-none text-white shadow-lg transition-shadow hover:shadow-xl"
        >
          <BotMessageSquare size={32} className="-scale-x-100" />
        </button>
      </AnimateIcon>
    </div>
  );
}

/* ── 드로어 셸 ──────────────────────────────────────────────── */

/**
 * RunView 가 자신의 "진행 중 런 중단" 능력을 드로어로 끌어올려
 * 등록하는 핸들. 진행 중 런이 없으면 null.
 */
interface CancelHandle {
  cancel: () => void;
}

function AgentDrawer({
  onClose,
  activeRunId,
  setActiveRunId,
}: {
  onClose: () => void;
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;
}) {
  /**
   * 진행 중 런이 있으면 RunView 가 여기에 cancel 함수를 등록한다.
   * ESC 우선순위: 진행 중 런이 있으면 ESC = 런 중단, 없으면 = 패널 닫기.
   */
  const cancelHandleRef = useRef<CancelHandle | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const handle = cancelHandleRef.current;
      if (handle) {
        // 진행 중 런이 있으면 ESC = 런 중단 (기존 닫기 동작보다 우선)
        e.preventDefault();
        handle.cancel();
      } else {
        // 진행 중 런이 없으면 기존 동작 유지 — 패널 닫기
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="AI 에이전트 패널"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <BotMessageSquare className="h-5 w-5 -scale-x-100" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">AI 에이전트</p>
            <p className="mt-1 text-xs text-muted-foreground">
              시험 생성을 도와드립니다
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {activeRunId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActiveRunId(null)}
            >
              새 작업
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="에이전트 패널 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 본문 — 런 선택 여부에 따라 분기 */}
      {activeRunId ? (
        <RunView
          // runId 가 바뀌면 cancelHandleRef 등록이 깨끗하게 재설정되도록 key 부여
          key={activeRunId}
          runId={activeRunId}
          cancelHandleRef={cancelHandleRef}
        />
      ) : (
        <IdleView onRunCreated={setActiveRunId} />
      )}
    </div>
  );
}

/* ── idle: 입력 + 최근 런 목록 ──────────────────────────────── */

function IdleView({
  onRunCreated,
}: {
  onRunCreated: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const pageContext = useAgentPageContext();

  const runsQuery = useQuery({
    queryKey: qk.agent.runs(),
    queryFn: listAgentRuns,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAgentRun({
        type: "exam_creation",
        prompt: prompt.trim(),
        pageContext,
      }),
    onSuccess: (run) => {
      setPrompt("");
      onRunCreated(run.id);
    },
  });

  const submit = () => {
    if (!prompt.trim() || createMutation.isPending) return;
    createMutation.mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* 안내문 */}
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">
            무엇을 도와드릴까요?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            만들고 싶은 시험을 설명해 주세요. 에이전트가 초안을 작성하면
            검토 후 승인할 수 있습니다.
          </p>
        </div>

        {/* 최근 런 목록 */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            최근 작업
          </p>
          {runsQuery.isLoading && (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          )}
          {runsQuery.isError && (
            <p className="text-xs text-destructive">
              목록을 불러오지 못했습니다.
            </p>
          )}
          {runsQuery.data && runsQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground">
              아직 진행한 작업이 없습니다.
            </p>
          )}
          {runsQuery.data && runsQuery.data.length > 0 && (
            <ul className="space-y-1.5">
              {runsQuery.data.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onRunCreated(run.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {run.title ?? run.input.prompt}
                    </span>
                    <Badge variant={STATUS_BADGE[run.status]}>
                      {STATUS_LABEL[run.status]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 입력창 */}
      <div className="border-t p-3">
        {createMutation.isError && (
          <p className="mb-2 px-1 text-xs text-destructive">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "요청을 시작하지 못했습니다."}
          </p>
        )}
        <Composer
          value={prompt}
          onChange={setPrompt}
          onSubmit={submit}
          disabled={createMutation.isPending}
          placeholder="예: 미적분 1단원 서술형 시험 5문항 만들어줘"
        />
      </div>
    </div>
  );
}

/* ── run: 상태별 타임라인/검토/결과 ─────────────────────────── */

function RunView({
  runId,
  cancelHandleRef,
}: {
  runId: string;
  cancelHandleRef: React.RefObject<CancelHandle | null>;
}) {
  const queryClient = useQueryClient();
  const completionHandledRef = useRef(false);

  const runQuery = useQuery({
    queryKey: qk.agent.run(runId),
    queryFn: () => getAgentRun(runId),
    // queued/running 일 때만 폴링, 그 외엔 정지.
    // 비동기 백엔드가 queued 런을 즉시 반환하므로, 생성 직후부터
    // POLL_INTERVAL_MS 간격으로 폴링이 돌며 스텝이 실시간으로 쌓인다.
    refetchInterval: (query) => {
      const run = query.state.data;
      return run && isActiveStatus(run.status) ? POLL_INTERVAL_MS : false;
    },
  });

  const run = runQuery.data;
  const active = run ? isActiveStatus(run.status) : false;

  // 중단 요청 — 협조적 취소. 호출 후 폴링이 곧 cancelled(또는 수정 턴이면
  // waiting_approval)를 받아 화면이 바뀐다.
  const cancelMutation = useMutation({
    mutationFn: () => cancelAgentRun(runId),
    onSettled: () => {
      // 응답 status 는 아직 안 바뀌었을 수 있으므로 캐시를 직접 덮어쓰지 않고
      // invalidate 만 — 폴링/리페치가 최신 상태를 가져온다.
      queryClient.invalidateQueries({ queryKey: qk.agent.run(runId) });
      queryClient.invalidateQueries({ queryKey: qk.agent.runs() });
    },
  });

  // 진행 중 런이면 드로어 ESC 핸들러가 호출할 cancel 함수를 등록.
  // 진행 중이 아니거나 이미 중단 요청 중이면 등록 해제 → ESC 는 기존 동작.
  const canCancel = active && !cancelMutation.isPending;
  const cancelRun = cancelMutation.mutate;
  useEffect(() => {
    if (!canCancel) {
      cancelHandleRef.current = null;
      return;
    }
    cancelHandleRef.current = { cancel: () => cancelRun() };
    return () => {
      cancelHandleRef.current = null;
    };
  }, [canCancel, cancelHandleRef, cancelRun]);

  // completed 진입 시 시험 목록 캐시 무효화 (한 번만)
  useEffect(() => {
    if (
      run?.status === "completed" &&
      !completionHandledRef.current
    ) {
      completionHandledRef.current = true;
      queryClient.invalidateQueries({ queryKey: qk.instructor.exams() });
    }
  }, [run?.status, queryClient]);

  if (runQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runQuery.isError || !run) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-destructive">
          {runQuery.error instanceof Error
            ? runQuery.error.message
            : "런을 불러오지 못했습니다."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 상태 바 */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {run.title ?? run.input.prompt}
        </span>
        <Badge variant={STATUS_BADGE[run.status]}>
          {STATUS_LABEL[run.status]}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* 타임라인 — 모든 상태에서 표시. 진행 중이면 맥동 인디케이터 동반. */}
        <AgentStepTimeline steps={run.steps} pending={active} />

        {run.status === "waiting_approval" && (
          <WaitingApprovalSection run={run} />
        )}

        {run.status === "completed" && <CompletedSection run={run} />}

        {run.status === "cancelled" && <CancelledSection />}

        {run.status === "failed" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">
                작업이 실패했습니다
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {run.error ?? "알 수 없는 오류가 발생했습니다."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 진행 중 런 — 중단 버튼 영역 (입력창 자리) */}
      {active && (
        <div className="border-t p-3">
          {cancelMutation.isError && (
            <p className="mb-2 px-1 text-xs text-destructive">
              {cancelMutation.error instanceof Error
                ? cancelMutation.error.message
                : "중단 요청에 실패했습니다."}
            </p>
          )}
          <StopBar
            onStop={() => cancelMutation.mutate()}
            stopping={cancelMutation.isPending}
          />
        </div>
      )}
    </div>
  );
}

/* ── cancelled: 중립 회색 안내 ──────────────────────────────── */

function CancelledSection() {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border bg-muted/50 p-3">
      <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">
          작업이 중단되었습니다
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          그때까지 진행된 단계는 위에 남아 있습니다. 새 작업을 시작할 수
          있습니다.
        </p>
      </div>
    </div>
  );
}

/* ── 진행 중 런 — 중단(stop) 바 ─────────────────────────────── */

function StopBar({
  onStop,
  stopping,
}: {
  onStop: () => void;
  stopping: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[26px] border bg-background p-2 pl-4 shadow-sm">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {stopping ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            중단 중…
          </>
        ) : (
          <>에이전트 실행 중 · ESC 로 중단</>
        )}
      </span>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-10 w-10 shrink-0 rounded-full"
        onClick={onStop}
        disabled={stopping}
        aria-label="에이전트 실행 중단"
      >
        {stopping ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Square className="h-4 w-4 fill-current" />
        )}
      </Button>
    </div>
  );
}

/* ── waiting_approval: draft 검토 + 승인/수정 ───────────────── */

function WaitingApprovalSection({ run }: { run: AgentRun }) {
  const queryClient = useQueryClient();
  const [revisePrompt, setRevisePrompt] = useState("");

  const refreshRun = (updated: AgentRun) => {
    queryClient.setQueryData(qk.agent.run(run.id), updated);
    queryClient.invalidateQueries({ queryKey: qk.agent.runs() });
  };

  const approveMutation = useMutation({
    // editedDraft 없이 승인 — 강사가 패널에서 직접 편집하는 기능은 MVP 범위 밖
    mutationFn: () => approveAgentRun(run.id, {}),
    onSuccess: refreshRun,
  });

  const reviseMutation = useMutation({
    mutationFn: () =>
      sendAgentRunMessage(run.id, { prompt: revisePrompt.trim() }),
    onSuccess: (updated) => {
      setRevisePrompt("");
      refreshRun(updated);
    },
  });

  const busy = approveMutation.isPending || reviseMutation.isPending;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        초안 검토
      </p>

      {run.output ? (
        <AgentDraftReview draft={run.output} />
      ) : (
        <p className="text-xs text-muted-foreground">
          초안 데이터가 비어 있습니다.
        </p>
      )}

      {(approveMutation.isError || reviseMutation.isError) && (
        <p className="text-xs text-destructive">
          {(approveMutation.error ?? reviseMutation.error) instanceof Error
            ? (
                (approveMutation.error ?? reviseMutation.error) as Error
              ).message
            : "요청을 처리하지 못했습니다."}
        </p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={busy || !run.output}
        onClick={() => approveMutation.mutate()}
      >
        {approveMutation.isPending && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        승인하고 시험 생성
      </Button>

      {/* 수정 요청 */}
      <div className="rounded-xl border bg-muted/40 p-2.5">
        <p className="mb-1.5 px-1 text-xs font-medium text-foreground">
          수정 요청
        </p>
        <Composer
          value={revisePrompt}
          onChange={setRevisePrompt}
          onSubmit={() => {
            if (!revisePrompt.trim() || busy) return;
            reviseMutation.mutate();
          }}
          disabled={busy}
          placeholder="예: 2번 문제를 더 쉽게 바꿔줘"
        />
      </div>
    </div>
  );
}

/* ── completed: 성공 + 시험 링크 ────────────────────────────── */

function CompletedSection({ run }: { run: AgentRun }) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-medium text-foreground">
          시험이 생성되었습니다
        </p>
      </div>
      {run.examId ? (
        <Button asChild variant="outline" size="sm" className="mt-3 w-full">
          <Link href={`/instructor/${run.examId}`}>생성된 시험 열기</Link>
        </Button>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          시험 ID를 확인할 수 없습니다.
        </p>
      )}
    </div>
  );
}

/* ── 공용 입력 컴포저 ───────────────────────────────────────── */

function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex items-end justify-between gap-2 rounded-[26px] border bg-background p-2 shadow-sm">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[42px] resize-none border-0 px-2 py-2 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <Button
        type="button"
        size="icon"
        className="h-10 w-10 shrink-0 rounded-full"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        aria-label="전송"
      >
        {disabled ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ArrowUp className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
