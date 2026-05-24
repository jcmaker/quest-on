"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  useBulkQuestionGeneration,
  type BulkSlot,
} from "@/hooks/useBulkQuestionGeneration";
import type { Question } from "@/components/instructor/QuestionEditor";
import type { GeneratedQuestion } from "@/hooks/useQuestionGeneration";
import { AlertCircle, RefreshCw, Sparkles, GripVertical } from "lucide-react";
import toast from "react-hot-toast";

// ── 유형 상수 ────────────────────────────────────────────────────────────────

type TabType = BulkSlot["type"];

const TABS: { type: TabType; label: string; description: string }[] = [
  { type: "mcq", label: "사지선다", description: "객관식 4지선다" },
  { type: "true-false", label: "O·X", description: "참·거짓 O/X" },
  { type: "case", label: "사례형", description: "서술형 사례" },
];

const TYPE_LABELS: Record<TabType, string> = {
  mcq: "사지선다",
  "true-false": "O·X",
  case: "사례형",
};

/** BulkSlot["type"] → Question["type"] 매핑 */
function toQuestionType(type: TabType): Question["type"] {
  switch (type) {
    case "mcq":
      return "multiple-choice";
    case "true-false":
      return "true-false";
    case "case":
      return "essay";
  }
}

/** GeneratedQuestion → Question 변환 */
function toQuestion(gq: GeneratedQuestion): Question {
  return {
    id: gq.id,
    text: gq.text,
    type: gq.type,
    options: gq.options,
    correctOptionIndex: gq.correctOptionIndex,
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examTitle: string;
  language: "ko" | "en";
  materialsText: Array<{ url: string; text: string; fileName: string }>;
  onQuestionsAppend: (questions: Question[]) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkQuestionGenerator({
  open,
  onOpenChange,
  examTitle,
  language,
  materialsText,
  onQuestionsAppend,
}: Props) {
  // 슬롯 목록 (우측 패널)
  const [slots, setSlots] = useState<BulkSlot[]>([]);
  // 현재 활성 탭
  const [activeTab, setActiveTab] = useState<TabType>("mcq");
  // 탭별 프롬프트 입력 유지
  const [promptByType, setPromptByType] = useState<Record<TabType, string>>({
    mcq: "",
    "true-false": "",
    case: "",
  });
  // 탭별 개수 선택
  const [countByType, setCountByType] = useState<Record<TabType, number>>({
    mcq: 3,
    "true-false": 3,
    case: 1,
  });

  // 드래그 상태
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragSrcIdxRef = useRef<number | null>(null);

  const {
    groupResults,
    generateAll,
    retryGroup,
    isLoading,
    allDone,
    reset,
    appendedGroupsRef,
  } = useBulkQuestionGeneration();

  // 생성 완료 → 유형별로 아직 append 안 된 성공 그룹만 처리 (중복 방지)
  useEffect(() => {
    if (!allDone) return;

    const newSuccessQuestions: GeneratedQuestion[] = [];
    Object.entries(groupResults).forEach(([type, result]) => {
      if (result.status === "success" && !appendedGroupsRef.current.has(type)) {
        newSuccessQuestions.push(...result.questions);
        appendedGroupsRef.current.add(type);
      }
    });

    if (newSuccessQuestions.length > 0) {
      onQuestionsAppend(newSuccessQuestions.map(toQuestion));
    }

    const hasError = Object.values(groupResults).some((g) => g.status === "error");
    if (!hasError) {
      // 전부 성공 시만 Sheet 닫기
      if (newSuccessQuestions.length > 0) {
        onOpenChange(false);
      }
    } else if (newSuccessQuestions.length > 0) {
      // 일부 성공 — Sheet 유지, 재시도 안내
      toast.success(`${newSuccessQuestions.length}개 추가됨. 실패한 유형을 재시도하세요.`);
    }
  }, [allDone, groupResults]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sheet가 닫힐 때 상태 초기화 (사용자 직접 닫기)
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSlots([]);
        setActiveTab("mcq");
        setPromptByType({ mcq: "", "true-false": "", case: "" });
        setCountByType({ mcq: 3, "true-false": 3, case: 1 });
        setDragOverIdx(null);
        reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset],
  );

  // open prop이 외부에서 false로 바뀔 때도 상태 초기화 (Fix 2: 자동 닫힘 후 상태 잔존)
  useEffect(() => {
    if (!open) {
      setSlots([]);
      setPromptByType({ mcq: "", "true-false": "", case: "" });
      setCountByType({ mcq: 3, "true-false": 3, case: 1 });
      setActiveTab("mcq");
      reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 슬롯 추가
  const addToSlots = useCallback(() => {
    const prompt = promptByType[activeTab];
    const count = countByType[activeTab];

    // 동일 유형의 기존 슬롯 count 합산 체크 (서버 max: 5)
    const existingCount = slots
      .filter((s) => s.type === activeTab)
      .reduce((sum, s) => sum + s.count, 0);
    if (existingCount + count > 5) {
      toast.error(
        `${TYPE_LABELS[activeTab]} 문제는 최대 5개까지 생성할 수 있습니다. (현재 ${existingCount}개)`
      );
      return;
    }

    const newSlot: BulkSlot = {
      tempId: `${activeTab}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: activeTab,
      prompt,
      count,
    };
    setSlots((prev) => [...prev, newSlot]);
  }, [activeTab, promptByType, countByType, slots]);

  // 슬롯 삭제
  const removeSlot = useCallback((tempId: string) => {
    setSlots((prev) => prev.filter((s) => s.tempId !== tempId));
  }, []);

  // 슬롯 위로
  const moveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setSlots((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  // 슬롯 아래로
  const moveDown = useCallback((idx: number) => {
    setSlots((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  // HTML5 드래그 핸들러
  const handleDragStart = (idx: number) => {
    dragSrcIdxRef.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const srcIdx = dragSrcIdxRef.current;
    if (srcIdx === null || srcIdx === idx) return;
    setSlots((prev) => {
      const next = [...prev];
      const [removed] = next.splice(srcIdx, 1);
      next.splice(idx, 0, removed);
      return next;
    });
    dragSrcIdxRef.current = null;
  };

  const handleDragEnd = () => {
    setDragOverIdx(null);
    dragSrcIdxRef.current = null;
  };

  // 생성 실행
  const handleGenerate = useCallback(async () => {
    if (slots.length === 0 || isLoading) return;
    appendedGroupsRef.current.clear(); // 새 생성 시작 — append 이력 초기화
    await generateAll(slots, {
      examTitle,
      language,
      materialsText: materialsText.length > 0 ? materialsText : undefined,
    });
  }, [slots, isLoading, generateAll, examTitle, language, materialsText, appendedGroupsRef]);

  // 재시도
  const handleRetry = useCallback(
    async (type: TabType) => {
      appendedGroupsRef.current.delete(type); // 해당 유형만 재시도 허용
      await retryGroup(type, slots, {
        examTitle,
        language,
        materialsText: materialsText.length > 0 ? materialsText : undefined,
      });
    },
    [retryGroup, slots, examTitle, language, materialsText, appendedGroupsRef],
  );

  const totalCount = slots.reduce((sum, s) => sum + s.count, 0);

  // 진행률 계산 (loading 그룹 → 미완성, success/error → 완성)
  const resultValues = Object.values(groupResults);
  const totalGroups = resultValues.length;
  const doneGroups = resultValues.filter(
    (r) => r.status === "success" || r.status === "error",
  ).length;
  const progressPct =
    totalGroups > 0 ? Math.round((doneGroups / totalGroups) * 100) : 0;

  const errorTypes = (Object.entries(groupResults) as [TabType, (typeof groupResults)[string]][])
    .filter(([, r]) => r.status === "error")
    .map(([type]) => type as TabType);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-4xl w-full overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 문제 일괄 생성
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* 2열 레이아웃 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
            {/* ─── 좌측: 유형 탭 + 입력 ─────────────────────────── */}
            <div className="space-y-4">
              {/* 탭 선택 */}
              <div
                role="tablist"
                aria-label="문제 유형"
                className="flex gap-1 rounded-lg border bg-muted/40 p-1"
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.type}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.type}
                    onClick={() => setActiveTab(tab.type)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      activeTab === tab.type
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
                      {tab.description}
                    </span>
                  </button>
                ))}
              </div>

              {/* 추가 지시사항 */}
              <div className="space-y-1.5">
                <label
                  htmlFor="bulk-prompt"
                  className="text-sm font-medium text-foreground"
                >
                  추가 지시사항{" "}
                  <span className="font-normal text-muted-foreground">
                    (선택)
                  </span>
                </label>
                <Textarea
                  id="bulk-prompt"
                  value={promptByType[activeTab]}
                  onChange={(e) =>
                    setPromptByType((prev) => ({
                      ...prev,
                      [activeTab]: e.target.value,
                    }))
                  }
                  placeholder={
                    activeTab === "mcq"
                      ? "예: AI가 의료 산업에 미치는 영향을 중심으로"
                      : activeTab === "true-false"
                        ? "예: 기업 윤리 관련 핵심 개념 위주로"
                        : "예: 스타트업 창업 과정에서의 리더십 딜레마"
                  }
                  rows={4}
                  className="resize-none text-sm"
                />
              </div>

              {/* 개수 선택 + 리스트에 추가 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">개수</span>
                  <Select
                    value={countByType[activeTab].toString()}
                    onValueChange={(v) =>
                      setCountByType((prev) => ({
                        ...prev,
                        [activeTab]: Number(v),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}개
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addToSlots}
                  disabled={isLoading}
                >
                  리스트에 추가
                </Button>
              </div>

              {/* 업로드 자료 배지 */}
              {materialsText.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    업로드한 자료 {materialsText.length}개가 자동 반영됩니다
                  </Badge>
                </div>
              )}

              {/* 진행 상태 */}
              {isLoading && (
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">
                    문제를 생성하고 있습니다...
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 에러 그룹 재시도 */}
              {!isLoading && errorTypes.length > 0 && (
                <div className="space-y-2">
                  {errorTypes.map((type) => (
                    <div
                      key={type}
                      className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="flex-1 text-destructive">
                        {TYPE_LABELS[type]} 생성 실패:{" "}
                        {groupResults[type]?.error}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRetry(type)}
                        className="shrink-0 gap-1"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        재시도
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── 우측: 대기 슬롯 리스트 ──────────────────────── */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                생성 목록
                {slots.length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    ({slots.length}개 슬롯 · {totalCount}문제)
                  </span>
                )}
              </p>

              {slots.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                  <p>아직 추가된 슬롯이 없습니다.</p>
                  <p className="mt-1 text-xs">
                    유형과 개수를 고른 후 &quot;리스트에 추가&quot;를 눌러보세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {slots.map((slot, idx) => (
                    <div
                      key={slot.tempId}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-sm transition-colors",
                        dragOverIdx === idx &&
                          dragSrcIdxRef.current !== idx &&
                          "border-primary bg-primary/5",
                      )}
                    >
                      {/* 드래그 핸들 */}
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />

                      {/* 유형 배지 */}
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {TYPE_LABELS[slot.type]}
                      </Badge>

                      {/* 번호 + 개수 */}
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {idx + 1}번 · {slot.count}개
                        {slot.prompt && (
                          <span
                            className="ml-1 truncate text-xs opacity-70"
                            title={slot.prompt}
                          >
                            — {slot.prompt}
                          </span>
                        )}
                      </span>

                      {/* ↑ ↓ 버튼 */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0"
                        disabled={idx === 0 || isLoading}
                        onClick={() => moveUp(idx)}
                        aria-label="위로 이동"
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0"
                        disabled={idx === slots.length - 1 || isLoading}
                        onClick={() => moveDown(idx)}
                        aria-label="아래로 이동"
                      >
                        ↓
                      </Button>

                      {/* 삭제 버튼 */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={isLoading}
                        onClick={() => removeSlot(slot.tempId)}
                        aria-label="슬롯 삭제"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── 하단 액션 ──────────────────────────────────────── */}
        <div className="border-t p-4">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={slots.length === 0 || isLoading}
            >
              {isLoading
                ? "생성 중..."
                : `${totalCount}개 문제 생성`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
