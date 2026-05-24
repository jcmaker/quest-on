"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Bot, Loader2, Send } from "lucide-react";
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
  status: string;
  committed_at: string | null;
  updated_at: string;
  messages: ChatMessage[];
  progress?: BulkGradeProgress;
};

type SessionData = {
  session: BulkGradeSession | null;
  studentCount: number;
  warning: string | null;
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
  // Track grading state for polling — initialized from server data
  const [isGradingActive, setIsGradingActive] = useState(false);

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
    refetchInterval: isGradingActive ? 3000 : false,
  });

  const sessionStatus = data?.session?.status ?? null;
  const isGrading = sessionStatus === "grading";
  const gradingDone = sessionStatus === "grading_done";
  const progress = data?.session?.progress;

  // Sync polling state with server status
  useEffect(() => {
    setIsGradingActive(isGrading);
  }, [isGrading]);

  const messages = useMemo<ChatMessage[]>(() => {
    return data?.session?.messages ?? [];
  }, [data]);

  // Restore editedGrades from server on load
  useEffect(() => {
    if (data?.session?.proposed_grades && editedGrades === null) {
      const serverGrades = data.session.proposed_grades as ProposedGradesMap;
      if (Object.keys(serverGrades).length > 0) {
        setEditedGrades(serverGrades);
      }
    }
    if (data?.warning) {
      setWarning(data.warning);
    }
  }, [data, editedGrades]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
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
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const startGradingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/exam/${examId}/bulk-grade/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err, "채점 시작에 실패했습니다.", res.status));
      }
      return res.json() as Promise<{ ok: boolean; total: number }>;
    },
    onSuccess: (result) => {
      toast.success(`${result.total}명 학생 채점을 시작했습니다.`);
      setIsGradingActive(true);
      queryClient.invalidateQueries({ queryKey: qk.instructor.bulkGradeSession(examId) });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!editedGrades || Object.keys(editedGrades).length === 0) {
        throw new Error("확정할 채점 결과가 없습니다.");
      }
      const grades = Object.entries(editedGrades).flatMap(([sessionId, qMap]) =>
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

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build sorted grade rows for the table
  const gradeRows = useMemo<GradeRow[]>(() => {
    if (!editedGrades) return [];
    const rows: GradeRow[] = [];
    let studentIdx = 1;
    for (const [sessionId, qMap] of Object.entries(editedGrades)) {
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
  }, [editedGrades]);

  const totalGrades = gradeRows.length;

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
            <span className={!isGrading && !gradingDone ? "text-primary font-medium" : ""}>
              ① 기준 논의
            </span>
            <span>→</span>
            <span className={isGrading ? "text-primary font-medium" : gradingDone ? "text-green-600 font-medium" : ""}>
              {isGrading ? "② 채점 진행 중" : gradingDone ? "② 채점 완료" : "② 채점"}
            </span>
            <span>→</span>
            <span className={sessionStatus === "committed" ? "text-green-600 font-medium" : ""}>
              ③ 확정
            </span>
          </div>

          {/* 진행률 bar */}
          {isGrading && progress && progress.total > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>채점 진행 중…</span>
                <span>{progress.completed}/{progress.total} 학생</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{
                    width: `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%`,
                  }}
                />
              </div>
              {progress.failed > 0 && (
                <p className="text-xs text-amber-600">{progress.failed}명 채점 실패 (재시도 중)</p>
              )}
            </div>
          )}

          {gradingDone && progress && progress.failed > 0 && (
            <p className="text-xs text-amber-600">
              ⚠️ {progress.failed}명 채점 실패 — 해당 학생 점수가 빠져 있습니다.
            </p>
          )}

          {warning && (
            <p className="text-sm text-amber-600">⚠️ {warning}</p>
          )}
        </SheetHeader>

        {/* Chat area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : displayMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              채점 기준을 자유롭게 입력해 보세요.
              <br />
              예: &quot;논리적 근거 제시 여부 40%, 답변 완성도 30%, 핵심 개념 활용 30%&quot;
            </p>
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
                    <span>채점 중…</span>
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
            <p className="mb-2 text-sm font-medium">제안 점수 ({totalGrades}개)</p>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-1 pr-2 font-normal">학생</th>
                  <th className="pb-1 pr-2 font-normal">문제</th>
                  <th className="pb-1 pr-2 font-normal">점수</th>
                  <th className="pb-1 font-normal">코멘트</th>
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
                        onChange={(e) => {
                          const v = Math.min(100, Math.max(0, Number(e.target.value)));
                          setEditedGrades((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              [row.sessionId]: {
                                ...prev[row.sessionId],
                                [row.qIdx]: {
                                  ...prev[row.sessionId]?.[row.qIdx],
                                  score: v,
                                },
                              },
                            };
                          });
                        }}
                        className="w-14 rounded border px-1 py-0.5 text-right"
                      />
                    </td>
                    <td className="py-1.5 max-w-[200px] truncate text-muted-foreground" title={row.comment}>
                      {row.comment}
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
              placeholder='예: "논리적 근거 제시 40%, 답변 완성도 30%, 핵심 개념 활용 30%"'
              rows={2}
              disabled={chatMutation.isPending}
              className="min-h-0 flex-1 resize-none"
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              aria-label="메시지 보내기"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* 채점 시작 버튼: 기준 논의 후 draft 상태에서만 */}
          {canStartGrading && !isGrading && !gradingDone && sessionStatus !== "committed" && (
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => startGradingMutation.mutate()}
              disabled={startGradingMutation.isPending || chatMutation.isPending}
            >
              {startGradingMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  채점 준비 중…
                </>
              ) : (
                `채점 시작 (${data?.studentCount ?? 0}명)`
              )}
            </Button>
          )}

          {/* 채점 확정: grading_done이거나 레거시 draft+proposed_grades */}
          {editedGrades && Object.keys(editedGrades).length > 0 && !isGrading && (
            <Button
              type="button"
              className="w-full"
              onClick={() => commitMutation.mutate()}
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
