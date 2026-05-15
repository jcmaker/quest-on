"use client";

import {
  Brain,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Hammer,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import type { AgentStep, AgentStepType } from "@/lib/agent/types";

/** stepType 별 아이콘 + 라벨 */
const STEP_META: Record<
  AgentStepType,
  { icon: typeof Brain; label: string }
> = {
  user_input: { icon: MessageSquare, label: "요청" },
  plan: { icon: ClipboardList, label: "계획" },
  data_fetch: { icon: Database, label: "자료 조회" },
  analysis: { icon: Brain, label: "분석" },
  tool_call: { icon: Hammer, label: "툴 실행" },
  draft: { icon: FileText, label: "초안 작성" },
  approval: { icon: ThumbsUp, label: "승인" },
  final: { icon: CheckCircle2, label: "완료" },
};

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const meta = STEP_META[step.stepType] ?? STEP_META.analysis;
  const Icon = meta.icon;

  return (
    <li className="flex gap-3">
      {/* 아이콘 + 세로 연결선 */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      {/* 본문 */}
      <div className={isLast ? "pb-1" : "pb-4"}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {step.title}
        </p>
        {step.content && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {step.content}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * 진행 중 인디케이터 — 타임라인 마지막 스텝 아래에 붙는 맥동 행.
 * 스텝 사이 공백(OpenAI 호출 대기) 동안에도 "살아있는" 느낌을 준다.
 */
function PendingRow({ hasSteps }: { hasSteps: boolean }) {
  return (
    <li className="flex gap-3" aria-live="polite">
      {/* 위 스텝과 이어지는 연결선 + 맥동 점 */}
      <div className="flex flex-col items-center">
        {hasSteps && <div className="mb-1 h-3 w-px bg-border" />}
        <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
      </div>

      {/* 본문 */}
      <div className="flex items-center pb-1">
        <span className="animate-pulse text-sm font-medium text-muted-foreground">
          에이전트가 작업 중…
        </span>
      </div>
    </li>
  );
}

export function AgentStepTimeline({
  steps,
  pending = false,
}: {
  steps: AgentStep[];
  /** queued/running 동안 true — 마지막 스텝 아래에 맥동 인디케이터 표시 */
  pending?: boolean;
}) {
  if (steps.length === 0) {
    if (pending) {
      return (
        <ol className="px-1">
          <PendingRow hasSteps={false} />
        </ol>
      );
    }
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        아직 단계가 없습니다.
      </p>
    );
  }

  return (
    <ol className="px-1">
      {steps.map((step, idx) => (
        <StepRow
          key={step.id}
          step={step}
          // pending 이면 마지막 스텝도 아래로 연결선이 이어진다
          isLast={idx === steps.length - 1 && !pending}
        />
      ))}
      {pending && <PendingRow hasSteps />}
    </ol>
  );
}
