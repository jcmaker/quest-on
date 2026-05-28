"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, Loader2, Send } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { extractErrorMessage } from "@/lib/error-messages";
import type { ProposedGradesMap } from "@/lib/bulk-grading";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type BulkGradeProgress = {
  total: number;
  completed: number;
  failed: number;
};

type BulkGradeSession = {
  id: string;
  proposed_grades: Record<string, Record<number, { score: number; comment: string }>>;
  calibration_sample_session_ids: string[];
  calibration_sample_grades: Record<string, Record<number, { score: number; comment: string }>>;
  calibration_status: string;
  grading_scope: "sample" | "full" | string;
  calibration_attempt: number;
  status: string;
  committed_at: string | null;
  updated_at: string;
  messages: ChatMessage[];
  sampleStudents?: SampleStudent[];
  progress?: BulkGradeProgress;
};

type SessionData = {
  session: BulkGradeSession | null;
  studentCount: number;
  warning: string | null;
};

type SampleStudent = {
  studentName: string;
  sessionId: string;
  overallSummary?: string;
  answers: Array<{
    qIdx: number;
    questionPrompt: string;
    answer: string;
    chatSummary: string;
  }>;
};

// Row in the proposed grades table, with student info for display
type GradeRow = {
  sessionId: string;
  studentLabel: string;
  qIdx: number;
  score: number;
  comment: string;
};

export interface BulkGradingPanelProps {
  examId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkGradingPanel({
  examId,
  open,
  onOpenChange,
  onCommitted,
}: BulkGradingPanelProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [editedGrades, setEditedGrades] = useState<ProposedGradesMap | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [canStartGrading, setCanStartGrading] = useState(false);

  const { data, isLoading } = useQuery<SessionData>({
    queryKey: qk.instructor.bulkGradeSession(examId),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade`, { signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "채점 세션을 불러오지 못했습니다");
      }
      return res.json() as Promise<SessionData>;
    },
    enabled: open && !!examId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.session?.status;
      const calibrationStatus = query.state.data?.session?.calibration_status;
      return status === "grading" || calibrationStatus === "sample_grading" ? 3000 : false;
    },
  });

  const sessionStatus = data?.session?.status ?? null;
  const calibrationStatus = data?.session?.calibration_status ?? "draft";
  const isSampleGrading = calibrationStatus === "sample_grading";
  const sampleReview = calibrationStatus === "sample_review";
  const sampleFailed = calibrationStatus === "sample_failed";
  const isFullGrading = sessionStatus === "grading" && data?.session?.grading_scope !== "sample";
  const gradingDone = sessionStatus === "grading_done";
  const gradingFailed = sessionStatus === "grading_failed";
  const committed = sessionStatus === "committed";
  const progress = data?.session?.progress;
  const hasProgress = !!progress && progress.total > 0;
  const processedCount = progress ? Math.min(progress.total, progress.completed + progress.failed) : 0;
  const progressPercent = hasProgress
    ? Math.round((processedCount / Math.max(progress.total, 1)) * 100)
    : 0;
  const hasPartialFailure = gradingDone && (progress?.failed ?? 0) > 0;
  const sampleStudents = data?.session?.sampleStudents ?? [];
  const activeGradeSource = sampleReview || sampleFailed || isSampleGrading
    ? data?.session?.calibration_sample_grades
    : data?.session?.proposed_grades;
  const activeScope: "sample" | "full" =
    sampleReview || sampleFailed || isSampleGrading ? "sample" : "full";
  const serverProposedGrades = data?.session?.proposed_grades as ProposedGradesMap | undefined;
  const currentFullGrades = editedGrades ?? serverProposedGrades ?? null;
  const displayWarning = warning ?? data?.warning ?? null;

  const messages = useMemo<ChatMessage[]>(() => {
    return data?.session?.messages ?? [];
  }, [data]);

  const hasAssistantCriteriaResponse = messages.some((m) => m.role === "assistant");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 패널이 열리고 메시지가 없으면 AI가 자동으로 인터뷰를 시작
  // initCalledRef가 진짜 중복 방지 장치 (isPending은 deps에 없어 stale closure이므로 제외)
  const initCalledRef = useRef(false);
  useEffect(() => {
    if (!open || isLoading || messages.length > 0 || initCalledRef.current) return;
    initCalledRef.current = true;
    chatMutation.mutate({ init: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, messages.length]);

  // 패널이 닫히면 init 플래그 초기화
  useEffect(() => {
    if (!open) initCalledRef.current = false;
  }, [open]);

  const chatMutation = useMutation({
    mutationFn: async (payload: { message: string } | { init: true }) => {
      const body = "init" in payload ? { init: true } : { message: payload.message };
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "AI 응답을 받지 못했습니다", res.status));
      }
      return res.json() as Promise<{
        assistantMessage: { id: string; role: string; content: string };
        canStartGrading: boolean;
        warning?: string | null;
      }>;
    },
    onSuccess: (result) => {
      setInput("");
      if (result.canStartGrading) setCanStartGrading(true);
      if (result.warning) setWarning(result.warning);
      queryClient.invalidateQueries({
        queryKey: qk.instructor.bulkGradeSession(examId),
      });
    },
    onError: (error: Error, payload) => {
      // init 실패 시 재시도 가능하도록 ref 초기화
      if ("init" in payload) initCalledRef.current = false;
      // 409(이미 시작됨)는 무시 — 서버가 중복 차단한 것이므로 에러 표시 불필요
      const isConflict = error.message.includes("409") || error.message.includes("이미 시작됐습니다");
      if (!isConflict) toast.error(error.message);
    },
  });

  const startGradingMutation = useMutation({
    mutationFn: async (scope: "sample" | "full") => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "채점 시작에 실패했습니다.", res.status));
      }
      return res.json() as Promise<{ ok: boolean; total: number; scope: "sample" | "full" }>;
    },
    onSuccess: (result) => {
      toast.success(
        result.scope === "sample"
          ? `${result.total}명 샘플 가채점을 시작했습니다.`
          : `${result.total}명 전체 가채점을 시작했습니다.`,
      );
      setCanStartGrading(false);
      setEditedGrades(null);
      setWarning(null);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!currentFullGrades || Object.keys(currentFullGrades).length === 0) {
        throw new Error("확정할 채점 결과가 없습니다.");
      }
      const grades = Object.entries(currentFullGrades).flatMap(([sessionId, qMap]) =>
        Object.entries(qMap).map(([qIdxStr, { score, comment }]) => ({
          session_id: sessionId,
          q_idx: Number(qIdxStr),
          score,
          comment,
        })),
      );
      const res = await fetch(`/api/exam/${examId}/bulk-grade/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "채점 저장에 실패했습니다", res.status));
      }
      return res.json() as Promise<{ ok: boolean; gradedCount: number }>;
    },
    onSuccess: (result) => {
      toast.success(`${result.gradedCount}개 채점이 확정되었습니다. 성적 공개는 별도로 진행하세요.`);
      setEditedGrades(null);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.studentSummaries(examId) });
      onOpenChange(false);
      onCommitted?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const showActiveGrading =
    startGradingMutation.isPending || isSampleGrading || isFullGrading;
  const isChatLocked = showActiveGrading || commitMutation.isPending;
  const canShowStartButton =
    (canStartGrading || hasAssistantCriteriaResponse || gradingFailed || hasPartialFailure) &&
    !showActiveGrading &&
    (!gradingDone || hasPartialFailure || sampleReview) &&
    !committed;
  const canStartFullGrading = sampleReview && !showActiveGrading && !committed;

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending || isChatLocked) return;
    chatMutation.mutate({ message: trimmed });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build sorted grade rows for the table
  const gradeRows = useMemo<GradeRow[]>(() => {
    const gradeMap = activeScope === "sample"
      ? (activeGradeSource as ProposedGradesMap | undefined)
      : currentFullGrades;
    if (!gradeMap) return [];
    const rows: GradeRow[] = [];
    let studentIdx = 1;
    for (const [sessionId, qMap] of Object.entries(gradeMap)) {
      for (const [qIdxStr, { score, comment }] of Object.entries(qMap)) {
        rows.push({
          sessionId,
          studentLabel: `학생 ${studentIdx}`,
          qIdx: Number(qIdxStr),
          score,
          comment,
        });
      }
      studentIdx++;
    }
    rows.sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.qIdx - b.qIdx);
    return rows;
  }, [activeGradeSource, activeScope, currentFullGrades]);

  const totalGrades = gradeRows.length;

  const handleCommit = () => {
    if (
      progress?.failed &&
      progress.failed > 0 &&
      !window.confirm(
        `${progress.failed}명 채점에 실패했습니다. 성공한 제안 점수만 확정하시겠습니까?`,
      )
    ) {
      return;
    }
    commitMutation.mutate();
  };

  const displayMessages = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[700px] max-w-full flex-col gap-0 p-0 sm:max-w-[700px]"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <SheetTitle>AI 일괄 채점</SheetTitle>
            {data?.studentCount != null && (
              <span className="text-sm text-muted-foreground font-normal">
                (대상: {data.studentCount}명)
              </span>
            )}
          </div>

          {/* 단계 인디케이터 */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={!isSampleGrading && !isFullGrading && !gradingDone ? "text-primary font-medium" : ""}>
              ① 기준 논의
            </span>
            <span>→</span>
            <span className={isSampleGrading || sampleReview ? "text-primary font-medium" : ""}>
              {isSampleGrading ? "② 샘플 가채점 중" : sampleReview ? "② 샘플 검토" : "② 샘플"}
            </span>
            <span>→</span>
            <span className={isFullGrading ? "text-primary font-medium" : gradingDone ? "text-green-600 font-medium" : ""}>
              {isFullGrading ? "③ 전체 채점 중" : gradingDone ? "③ 전체 채점 완료" : "③ 전체 채점"}
            </span>
            <span>→</span>
            <span className={sessionStatus === "committed" ? "text-green-600 font-medium" : ""}>
              ④ 확정
            </span>
          </div>

          {showActiveGrading && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="font-medium">
                  {isSampleGrading ? "샘플 답안을 백그라운드에서 가채점 중입니다." : "학생 답안을 백그라운드에서 채점 중입니다."}
                </span>
              </div>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                창을 닫아도 계속 진행됩니다. 샘플 결과가 맞으면 전체 가채점을 시작할 수 있습니다.
              </p>
            </div>
          )}

          {/* 진행률 bar */}
          {showActiveGrading && hasProgress && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {isSampleGrading ? "샘플 처리" : "처리"} {processedCount}/{progress.total}명
                  {progress.failed > 0
                    ? ` · 성공 ${progress.completed}명 · 실패 ${progress.failed}명`
                    : ""}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {showActiveGrading && !hasProgress && (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>채점 작업을 등록하고 있습니다.</span>
            </div>
          )}

          {gradingDone && progress && progress.failed > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {progress.failed}명 채점에 실패했습니다. 성공한 제안 점수만 확정하거나 전체 학생을 다시 채점할 수 있습니다.
              </p>
            </div>
          )}

          {gradingDone && progress && progress.failed === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>AI 제안 점수 생성이 완료되었습니다. 검토 후 확정하세요.</span>
            </div>
          )}

          {sampleReview && !showActiveGrading && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>샘플 가채점이 완료되었습니다. 결과가 기준에 맞으면 전체 학생 가채점을 시작하세요.</p>
            </div>
          )}

          {gradingFailed && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                AI 채점이 완료되지 않았습니다. 다시 채점을 시작하면 이전 제안 점수를 초기화하고 새로 생성합니다.
              </p>
            </div>
          )}

          {displayWarning && (
            <p className="text-sm text-amber-600">{displayWarning}</p>
          )}
        </SheetHeader>

        {/* Chat area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!isLoading && sampleStudents.length > 0 && (
            <div className="mb-4 rounded-md border bg-blue-50/60 p-3 text-xs dark:bg-blue-950/20">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium text-blue-950 dark:text-blue-100">
                  기준 보정 샘플 {sampleStudents.length}명
                </p>
                {sampleReview && (
                  <span className="text-blue-700 dark:text-blue-300">샘플 가채점 완료</span>
                )}
              </div>
              <div className="space-y-2">
                {sampleStudents.map((student, index) => (
                  <details
                    key={student.sessionId}
                    className="rounded border bg-background/80 px-2 py-1.5"
                    open={index === 0 && displayMessages.length === 0}
                  >
                    <summary className="cursor-pointer font-medium">
                      샘플 {index + 1} · {student.studentName}
                    </summary>
                    {student.overallSummary && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {student.overallSummary}
                      </p>
                    )}
                    {student.answers.slice(0, 2).map((answer) => (
                      <div key={answer.qIdx} className="mt-2 space-y-1">
                        <p className="font-medium">Q{answer.qIdx + 1}</p>
                        <p className="line-clamp-3 text-muted-foreground">
                          {answer.answer || "제출 답안 없음"}
                        </p>
                      </div>
                    ))}
                  </details>
                ))}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="space-y-2 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                <p>샘플 학생 답안을 분석하고 있습니다…</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              {displayMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <span className="text-xs font-medium">나</span>
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <AIMessageRenderer
                        content={msg.content}
                        timestamp={msg.created_at ?? new Date().toISOString()}
                        variant="plain"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>AI가 답변 작성 중…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Proposed grades table */}
        {gradeRows.length > 0 && (
          <div className="max-h-[280px] shrink-0 overflow-y-auto border-t px-6 py-3">
            <p className="mb-2 text-sm font-medium">
              {activeScope === "sample" ? "샘플 제안 점수" : "전체 제안 점수"} ({totalGrades}개)
            </p>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-1 pr-2 font-normal">학생</th>
                  <th className="pb-1 pr-2 font-normal">문제</th>
                  <th className="pb-1 pr-2 font-normal">점수</th>
                  <th className="pb-1 pr-2 font-normal">코멘트</th>
                  <th className="pb-1 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((row) => (
                  <tr
                    key={`${row.sessionId}-${row.qIdx}`}
                    className="border-b last:border-0"
                  >
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                      {row.studentLabel}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">Q{row.qIdx + 1}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={row.score}
                        disabled={activeScope === "sample"}
                        onChange={(e) => {
                          if (activeScope === "sample") return;
                          const v = Math.min(100, Math.max(0, Number(e.target.value)));
                          setEditedGrades((prev) => {
                            const base = prev ?? currentFullGrades;
                            if (!base) return prev;
                            return {
                              ...base,
                              [row.sessionId]: {
                                ...base[row.sessionId],
                                [row.qIdx]: {
                                  ...base[row.sessionId]?.[row.qIdx],
                                  score: v,
                                },
                              },
                            };
                          });
                        }}
                        className="w-14 rounded border px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2 max-w-[200px] truncate text-muted-foreground" title={row.comment}>
                      {row.comment}
                    </td>
                    <td className="py-1.5">
                      <a
                        href={`/instructor/${examId}/grade/${row.sessionId}?questionType=case&qIdx=${row.qIdx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${row.studentLabel} Q${row.qIdx + 1} 개별 채점 새 탭에서 열기`}
                        data-testid={`bulk-grade-row-link-${row.sessionId}-${row.qIdx}`}
                        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline whitespace-nowrap"
                      >
                        개별 채점
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer: input + send + commit */}
        <SheetFooter className="shrink-0 flex-col gap-2 border-t px-6 py-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isChatLocked
                  ? "채점 진행 중에는 기준을 수정할 수 없습니다."
                  : '예: "논리적 근거 제시 40%, 답변 완성도 30%, 핵심 개념 활용 30%"'
              }
              rows={2}
              disabled={chatMutation.isPending || isChatLocked}
              className="min-h-0 flex-1 resize-none"
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending || isChatLocked}
              aria-label="메시지 보내기"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {showActiveGrading && (
            <Button type="button" variant="secondary" className="w-full" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              채점 진행 중
            </Button>
          )}

          {/* 채점 시작 버튼: 기준 논의 후 draft/failed 상태에서만 */}
          {canShowStartButton && (
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => startGradingMutation.mutate("sample")}
              disabled={startGradingMutation.isPending || chatMutation.isPending}
            >
              {startGradingMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  채점 작업 등록 중…
                </>
              ) : sampleReview ? (
                "샘플 다시 가채점"
              ) : sampleFailed ? (
                "샘플 다시 가채점"
              ) : gradingFailed ? (
                "샘플부터 다시 가채점"
              ) : hasPartialFailure ? (
                "샘플부터 다시 확인"
              ) : (
                `샘플 가채점 시작 (${sampleStudents.length || 3}명)`
              )}
            </Button>
          )}

          {canStartFullGrading && (
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => startGradingMutation.mutate("full")}
              disabled={startGradingMutation.isPending || chatMutation.isPending}
            >
              {startGradingMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  전체 채점 작업 등록 중…
                </>
              ) : (
                `이 기준으로 전체 가채점 시작 (${data?.studentCount ?? 0}명)`
              )}
            </Button>
          )}

          {/* 채점 확정: grading_done이거나 레거시 draft+proposed_grades */}
          {activeScope === "full" && gradingDone && currentFullGrades && Object.keys(currentFullGrades).length > 0 && !showActiveGrading && !gradingFailed && (
            <Button
              type="button"
              className="w-full"
              onClick={handleCommit}
              disabled={commitMutation.isPending || chatMutation.isPending}
            >
              {commitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                `채점 확정 (${totalGrades}개)`
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
