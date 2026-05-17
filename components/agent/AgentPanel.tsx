"use client";

/**
 * AgentPanel — 강사용 AI 에이전트 우측 사이드바 패널.
 *
 * 데스크톱: 레이아웃 flex 안에서 gap-div가 SidebarInset를 밀어내고,
 *           실제 패널 본체는 `fixed inset-y-0 right-0`으로 동일 너비.
 *           → 본문이 패널 폭만큼 좁아지는 page reflow 방식.
 *
 * 모바일(<768px): shadcn Sheet(side=right) 오버레이 — 본문 reflow 없음.
 *
 * 개폐 트리거:
 *   - 데스크톱: DashboardSidebar의 SidebarFooter 위 "AI 에이전트" 버튼
 *   - 모바일: MobileBottomNav의 에이전트 아이템
 *
 * 닫기: 패널 헤더 X 버튼, ESC(running 중이면 ESC = cancelRun 우선).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Square,
  X,
} from "lucide-react";
import { useAgentRunController } from "@/components/agent/AgentRunController";
import { AgentStepTimeline } from "@/components/agent/AgentStepTimeline";
import { useAgentPanel } from "@/components/agent/AgentPanelProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/* ── 패널 너비 ────────────────────────────────────────────────── */
// 데스크톱(≥1024px) 360px, 태블릿(768~1023px) 320px — 반응형 Tailwind 클래스.
// gap-div와 패널 본체가 동일 클래스를 써 항상 폭이 일치한다(JS resize 불필요).
const PANEL_WIDTH_OPEN = "w-[320px] lg:w-[360px]";

/* ─────────────────────────────────────────────────────────────── */

export default function AgentPanel() {
  const { open, setOpen } = useAgentPanel();
  const isMobile = useIsMobile();

  const close = useCallback(() => setOpen(false), [setOpen]);

  /* ── 모바일: Sheet 오버레이 ── */
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[min(360px,100vw)] p-0 bg-sidebar border-l flex flex-col [&>button]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>AI 에이전트</SheetTitle>
            <SheetDescription>AI 에이전트 패널</SheetDescription>
          </SheetHeader>
          <PanelShell onClose={close} />
        </SheetContent>
      </Sheet>
    );
  }

  /* ── 데스크톱: fixed 패널 + gap-div는 레이아웃에서 렌더 ── */
  // 패널 본체만 여기서 렌더. gap-div는 layout에서 AgentPanelGap으로 렌더.
  return (
    <div
      role="dialog"
      aria-label="AI 에이전트 패널"
      aria-modal="false"
      inert={!open}
      data-state={open ? "open" : "closed"}
      className={cn(
        "fixed inset-y-0 right-0 z-40 hidden md:flex flex-col overflow-hidden bg-sidebar border-l",
        "transition-[width,opacity] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        open
          ? cn("opacity-100", PANEL_WIDTH_OPEN)
          : "w-0 opacity-0 pointer-events-none",
      )}
    >
      {/* 컨텐츠는 고정 너비 wrapper 안에 — 바깥 width가 0으로 줄어도 안 깨짐 */}
      <div className={cn("flex h-full flex-col", PANEL_WIDTH_OPEN)}>
        <PanelShell onClose={close} />
      </div>
    </div>
  );
}

/**
 * AgentPanelGap — 레이아웃에서 SidebarInset의 flex 형제로 위치해 본문을 밀어내는 gap placeholder.
 * 데스크톱 전용(md:block). 모바일에선 표시되지 않는다.
 */
export function AgentPanelGap() {
  const { open } = useAgentPanel();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden md:block shrink-0",
        "transition-[width] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        open ? PANEL_WIDTH_OPEN : "w-0",
      )}
    />
  );
}

/* ── 패널 셸 (헤더 + 본문 — 데스크톱/모바일 공용) ─────────────── */

function PanelShell({ onClose }: { onClose: () => void }) {
  const { phase, cancelRun } = useAgentRunController();
  const { open } = useAgentPanel();
  const running = phase === "running";

  // ESC: running이면 cancelRun, 아니면 패널 닫기.
  // 데스크톱 패널은 닫혀도 width 0으로 항상 마운트되므로, open일 때만 리스너를
  // 등록한다 — 닫힌 패널 상태에서 ESC가 cancelRun을 발화하는 것을 막는다.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (running) {
        e.preventDefault();
        cancelRun();
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, running, cancelRun, onClose]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <PanelHeader onClose={onClose} phase={phase} />

      {/* 본문 — phase에 따라 분기 */}
      <PanelBody />
    </div>
  );
}

/* ── 헤더 ────────────────────────────────────────────────────── */

const PHASE_BADGE: Record<
  string,
  { label: string; className: string; pulse?: boolean } | null
> = {
  idle: null,
  running: {
    label: "실행 중",
    className: "bg-primary/10 text-primary",
    pulse: true,
  },
  done: {
    label: "완료",
    className: "bg-emerald-500/10 text-emerald-600",
  },
  failed: {
    label: "실패",
    className: "bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "중단됨",
    className: "bg-muted text-muted-foreground",
  },
};

function PanelHeader({
  onClose,
  phase,
}: {
  onClose: () => void;
  phase: string;
}) {
  const badge = PHASE_BADGE[phase] ?? null;

  return (
    <div className="sticky top-0 z-10 border-b bg-sidebar">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent">
          <BotMessageSquare className="h-4 w-4 text-sidebar-accent-foreground -scale-x-100" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none text-sidebar-foreground">
            AI 에이전트
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            시험 편집을 도와드립니다
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
          aria-label="에이전트 패널 닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* phase 뱃지 스트립 */}
      {badge && (
        <div
          className={cn(
            "flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium",
            badge.className,
          )}
        >
          {badge.pulse && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
          )}
          {badge.label}
        </div>
      )}
    </div>
  );
}

/* ── 본문 — phase 디스패치 ──────────────────────────────────── */

function PanelBody() {
  const { phase } = useAgentRunController();

  switch (phase) {
    case "running":
      return <RunningView />;
    case "done":
      return <DoneView />;
    case "failed":
      return <FailedView />;
    case "cancelled":
      return <CancelledView />;
    case "idle":
    default:
      return <IdleView />;
  }
}

/* ── idle: 입력창 + 안내 ────────────────────────────────────── */

function IdleView() {
  const { startRun } = useAgentRunController();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await startRun(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">
            무엇을 도와드릴까요?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            하고 싶은 작업을 자연어로 설명해 주세요. 에이전트가 직접
            편집기를 조작하고, 그 과정을 여기에 단계별로 보여드립니다.
          </p>
        </div>
      </div>

      <div className="border-t p-3">
        <Composer
          value={prompt}
          onChange={setPrompt}
          onSubmit={() => void submit()}
          disabled={submitting}
          placeholder="예: 미적분 1단원 서술형 시험 5문항 만들어줘"
        />
      </div>
    </div>
  );
}

/* ── running: 라이브 타임라인 + 중단 ────────────────────────── */

function RunningView() {
  const { activeRun, cancelRun } = useAgentRunController();
  const [stopping, setStopping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const steps = activeRun?.steps ?? [];

  // 자동 스크롤 — 사용자가 위로 올린 상태면 스킵
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (atBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [steps.length]);

  const onStop = () => {
    setStopping(true);
    cancelRun();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <AgentStepTimeline steps={steps} pending />
      </div>

      <div className="border-t p-3">
        <StopBar onStop={onStop} stopping={stopping} />
      </div>
    </div>
  );
}

/* ── running 중단 바 ────────────────────────────────────────── */

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
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            에이전트 실행 중 · ESC로 중단
          </>
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

/* ── done: 완료 요약 ────────────────────────────────────────── */

function DoneView() {
  const { activeRun, summary, reset } = useAgentRunController();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AgentStepTimeline steps={activeRun?.steps ?? []} />

        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-medium text-foreground">
              작업을 완료했습니다
            </p>
          </div>
          {summary && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
      </div>

      <div className="border-t p-3">
        <Button type="button" className="w-full" onClick={reset}>
          새 작업 시작하기
        </Button>
      </div>
    </div>
  );
}

/* ── failed: 에러 ───────────────────────────────────────────── */

function FailedView() {
  const { activeRun, summary, reset } = useAgentRunController();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AgentStepTimeline steps={activeRun?.steps ?? []} />

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              작업이 실패했습니다
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {activeRun?.error ?? summary ?? "알 수 없는 오류가 발생했습니다."}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t p-3">
        <Button type="button" className="w-full" onClick={reset}>
          새 작업 시작하기
        </Button>
      </div>
    </div>
  );
}

/* ── cancelled: 중단 안내 ───────────────────────────────────── */

function CancelledView() {
  const { activeRun, reset } = useAgentRunController();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AgentStepTimeline steps={activeRun?.steps ?? []} />

        <div className="mt-4 flex items-start gap-2 rounded-xl border bg-muted/50 p-3">
          <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              작업이 중단되었습니다
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              그때까지 진행된 단계는 위에 남아 있습니다. 새 작업을 시작할
              수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t p-3">
        <Button type="button" className="w-full" onClick={reset}>
          새 작업 시작하기
        </Button>
      </div>
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
        className="min-h-[44px] max-h-[120px] resize-none border-0 px-2 py-2 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
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
