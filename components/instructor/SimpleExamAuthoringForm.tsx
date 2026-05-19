"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Question } from "@/components/instructor/QuestionEditor";
import { QuestionEditor } from "@/components/instructor/QuestionEditor";
import { QuestionAdjustSheet } from "@/components/instructor/QuestionAdjustSheet";
import type { RubricItem } from "@/components/instructor/RubricTable";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";
import toast from "react-hot-toast";

type ExtractionStatus = "uploading" | "extracting" | "done" | "failed";

interface SimpleExamAuthoringFormProps {
  title: string;
  duration: number;
  language: "ko" | "en";
  titleRef?: Ref<HTMLInputElement>;
  onTitleChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onLanguageChange: (value: "ko" | "en") => void;
  files: File[];
  disabledFiles: Set<number>;
  canAddMoreFiles: boolean;
  isDragOver: boolean;
  totalSize: number;
  extractionStatus?: Map<string, ExtractionStatus>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragAreaClick: () => void;
  onRemoveFile: (index: number) => void;
  getFileIcon: (fileName: string) => ReactNode;
  /**
   * AI 에이전트 실행 레이어가 쓰는 숨은 문제 생성기.
   * 다이얼로그에는 렌더링하지 않지만, 에이전트 ref 핸들이 살아 있도록
   * 폼 내부에 시각적으로 숨겨 마운트한다.
   */
  generator: ReactNode;
  questions: Question[];
  highlightedIds?: Set<string>;
  onQuestionAdd: (type?: Question["type"], count?: number) => void;
  onQuestionUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean | number | string[],
  ) => void;
  onQuestionRemove: (id: string) => void;
  onQuestionMove: (index: number, direction: "up" | "down") => void;
  rubric: RubricItem[];
  onRubricAdd: () => void;
  onRubricUpdate: (id: string, field: keyof RubricItem, value: string) => void;
  onRubricRemove: (id: string) => void;
  isRubricPublic: boolean;
  onRubricPublicChange: (value: boolean) => void;
  chatWeight: number | null;
  onChatWeightChange: (value: number | null) => void;
  pendingAISuggestions: RubricItem[];
  onAcceptAISuggestions: () => void;
  onDismissAISuggestions: () => void;
  onAIGenerateRubric: (params?: {
    topics?: string;
    customInstructions?: string;
  }) => void;
  isAIGeneratingRubric: boolean;
  submitReasons: string[];
  isSubmitting: boolean;
  onCancel: () => void;
}

function getStatusText(status?: ExtractionStatus): string {
  switch (status) {
    case "uploading":
      return "업로드 중";
    case "extracting":
      return "분석 중";
    case "done":
      return "완료";
    case "failed":
      return "실패";
    default:
      return "대기";
  }
}

/**
 * "한 줄 한 박스" 필드 블록.
 * 라벨과 안내문은 입력 위에 평문으로 두고, 경계(테두리)는 실제 입력
 * 컨트롤에만 둔다 — 섹션 전체를 카드로 감싸지 않는다.
 */
function Field({
  label,
  htmlFor,
  required,
  optional,
  helper,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  helper?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label
            htmlFor={htmlFor}
            className="flex items-center gap-1.5 text-base font-semibold"
          >
            {label}
            {required && (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            )}
            {optional && (
              <span className="text-xs font-normal text-muted-foreground">
                선택
              </span>
            )}
          </Label>
          {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** 문제 추가 다이얼로그에서 고르는 문제 유형. */
const QUESTION_TYPE_OPTIONS: {
  type: Question["type"];
  label: string;
  description: string;
}[] = [
  {
    type: "multiple-choice",
    label: "사지선다",
    description: "4지선다 객관식",
  },
  { type: "true-false", label: "O·X", description: "참·거짓 O/X" },
  { type: "essay", label: "사례형", description: "서술형 사례" },
];

/**
 * 문제 추가 다이얼로그의 유형 선택기.
 * 단일 선택이므로 radiogroup 으로 노출하고 좌우/상하 방향키 이동을 지원한다.
 */
function QuestionTypePicker({
  value,
  onChange,
}: {
  value: Question["type"];
  onChange: (type: Question["type"]) => void;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const currentIndex = QUESTION_TYPE_OPTIONS.findIndex(
      (o) => o.type === value,
    );
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      (currentIndex + delta + QUESTION_TYPE_OPTIONS.length) %
      QUESTION_TYPE_OPTIONS.length;
    const next = QUESTION_TYPE_OPTIONS[nextIndex];
    onChange(next.type);
    document.getElementById(`question-type-${next.type}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="문제 유형"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {QUESTION_TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.type;
        return (
          <button
            key={option.type}
            id={`question-type-${option.type}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.type)}
            onKeyDown={handleKeyDown}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-square ${
              isSelected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            <span className="text-base font-semibold">{option.label}</span>
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SimpleExamAuthoringForm({
  title,
  duration,
  language,
  titleRef,
  onTitleChange,
  onDurationChange,
  onLanguageChange,
  files,
  disabledFiles,
  canAddMoreFiles,
  isDragOver,
  totalSize,
  extractionStatus,
  onFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragAreaClick,
  onRemoveFile,
  getFileIcon,
  generator,
  questions,
  highlightedIds,
  onQuestionAdd,
  onQuestionUpdate,
  onQuestionRemove,
  onQuestionMove,
  rubric,
  onRubricAdd,
  onRubricUpdate,
  onRubricRemove,
  isRubricPublic,
  onRubricPublicChange,
  chatWeight,
  onChatWeightChange,
  pendingAISuggestions,
  onAcceptAISuggestions,
  onDismissAISuggestions,
  onAIGenerateRubric,
  isAIGeneratingRubric,
  submitReasons,
  isSubmitting,
  onCancel,
}: SimpleExamAuthoringFormProps) {
  const [showRubricDetails, setShowRubricDetails] = useState(false);
  const [showAdvancedGrading, setShowAdvancedGrading] = useState(false);
  const [rubricTopics, setRubricTopics] = useState("");
  const [rubricInstructions, setRubricInstructions] = useState("");
  // "+" 문제 추가 — 문제 유형을 고르는 Dialog 의 열림 상태.
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  // 추가 다이얼로그에서 선택 중인 문제 유형.
  const [pickedType, setPickedType] =
    useState<Question["type"]>("multiple-choice");
  // 추가 다이얼로그에서 한 번에 추가할 문제 개수 (1~5).
  const [pickedCount, setPickedCount] = useState(1);

  const isUnlimited = duration === 0;
  const ready = submitReasons.length === 0;
  const effectiveWeight = chatWeight ?? 50;
  const isCustomWeight = chatWeight !== null;

  const materialSummary = useMemo(() => {
    if (files.length === 0) return "자료 없음";
    const statuses = Array.from(extractionStatus?.values() ?? []);
    const failed = statuses.filter((status) => status === "failed").length;
    const inProgress = statuses.filter(
      (status) => status === "uploading" || status === "extracting",
    ).length;
    if (failed > 0) return `${files.length}개 중 ${failed}개 실패`;
    if (inProgress > 0) return `${files.length}개 분석 중`;
    return `${files.length}개 준비됨`;
  }, [extractionStatus, files.length]);

  const handleDurationTextChange = (value: string) => {
    const next = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(next)) return;
    onDurationChange(Math.min(1440, Math.max(1, next)));
  };

  // 문제별 AI 다듬기 — 각 문제 카드의 "AI 다듬기" 버튼이 이 시트를 연다.
  const [sheetQuestionId, setSheetQuestionId] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustHistories, setAdjustHistories] = useState<
    Map<string, ChatMessage[]>
  >(new Map());

  const sheetQuestion =
    questions.find((q) => q.id === sheetQuestionId) ?? null;
  const sheetHistory = sheetQuestionId
    ? (adjustHistories.get(sheetQuestionId) ?? [])
    : [];

  const handleAdjust = useCallback(
    async (instruction: string) => {
      if (!sheetQuestionId) return null;
      const question = questions.find((q) => q.id === sheetQuestionId);
      if (!question) return null;

      setIsAdjusting(true);
      setAdjustHistories((prev) => {
        const next = new Map(prev);
        next.set(sheetQuestionId, [
          ...(next.get(sheetQuestionId) ?? []),
          { role: "user", content: instruction },
        ]);
        return next;
      });

      try {
        const res = await fetch("/api/ai/adjust-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: sheetQuestionId,
            questionText: question.text,
            instruction,
            language,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as {
          questionText: string;
          explanation: string;
        };
        setAdjustHistories((prev) => {
          const next = new Map(prev);
          next.set(sheetQuestionId, [
            ...(next.get(sheetQuestionId) ?? []),
            {
              role: "assistant",
              content: data.explanation,
              questionText: data.questionText,
            },
          ]);
          return next;
        });
        return data;
      } catch {
        toast.error("문제 수정에 실패했습니다.");
        return null;
      } finally {
        setIsAdjusting(false);
      }
    },
    [sheetQuestionId, questions, language],
  );

  const handleApplyAdjustment = useCallback(
    (newText: string) => {
      if (!sheetQuestionId) return;
      onQuestionUpdate(sheetQuestionId, "text", newText);
    },
    [sheetQuestionId, onQuestionUpdate],
  );

  return (
    <div className="space-y-8">
      <div className="space-y-10">
        {/* 시험명 */}
        <Field
          label="시험명"
          htmlFor="simple-title"
          required
          helper="학생이 입장 화면과 결과지에서 보게 될 이름입니다."
        >
          <Input
            ref={titleRef}
            id="simple-title"
            aria-label="시험 제목"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="예) 국제경영론 25-1 중간고사"
            className="h-12 text-base"
            required
          />
        </Field>

        {/* 시험 시간 */}
        <Field
          label="시험 시간"
          htmlFor="simple-duration"
          helper="응시 제한 시간입니다. 무제한으로 두면 과제형으로 출제됩니다."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="simple-duration"
              type="number"
              min={1}
              max={1440}
              value={isUnlimited ? "" : duration.toString()}
              disabled={isUnlimited}
              onChange={(e) => handleDurationTextChange(e.target.value)}
              placeholder={isUnlimited ? "무제한" : "60"}
              className="h-11 w-28 text-center"
            />
            <span className="text-sm text-muted-foreground">분</span>
            {[30, 60, 90, 120].map((value) => (
              <Button
                key={value}
                type="button"
                variant={
                  !isUnlimited && duration === value ? "default" : "outline"
                }
                size="sm"
                onClick={() => onDurationChange(value)}
                disabled={isUnlimited}
              >
                {value}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Switch
                id="simple-unlimited"
                checked={isUnlimited}
                onCheckedChange={(checked) =>
                  onDurationChange(checked ? 0 : 60)
                }
              />
              <Label
                htmlFor="simple-unlimited"
                className="cursor-pointer text-sm"
              >
                무제한
              </Label>
            </div>
            {!isUnlimited && duration > 0 && duration < 15 && (
              <p className="flex basis-full items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                출제하려면 15분 이상으로 설정하세요.
              </p>
            )}
          </div>
        </Field>

        {/* 수업 자료 */}
        <Field
          label="수업 자료"
          optional
          helper="업로드하면 AI가 자료를 근거로 문제와 평가 기준을 만듭니다."
        >
          <div className="space-y-3">
            <Input
              id="materials"
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp"
              onChange={onFileSelect}
              className="hidden"
              disabled={!canAddMoreFiles}
            />
            <button
              type="button"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={onDragAreaClick}
              disabled={!canAddMoreFiles}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors ${
                isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : canAddMoreFiles
                    ? "border-border hover:border-muted-foreground hover:bg-muted/50"
                    : "cursor-not-allowed border-destructive/40 bg-destructive/5 text-muted-foreground"
              }`}
            >
              {isDragOver ? (
                <FolderOpen className="h-8 w-8" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {isDragOver
                  ? "파일을 여기에 놓으세요"
                  : "파일을 드래그하거나 클릭하여 선택"}
              </span>
              <span className="text-xs text-muted-foreground">
                PPT · PDF · 워드 · 엑셀 · CSV · 한글 · 이미지 (최대 50MB)
              </span>
            </button>
            {(files.length > 0 || !canAddMoreFiles) && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => {
                  const status = extractionStatus?.get(file.name);
                  const disabled = disabledFiles.has(index);
                  return (
                    <span
                      key={`${file.name}-${index}`}
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
                        disabled || status === "failed"
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                          : status === "done"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "bg-muted/40"
                      }`}
                    >
                      {status === "uploading" || status === "extracting" ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        getFileIcon(file.name)
                      )}
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs opacity-75">
                        {getStatusText(status)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => onRemoveFile(index)}
                        aria-label={`${file.name} 삭제`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  );
                })}
                <span className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted-foreground">
                  {(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB
                </span>
              </div>
            )}
          </div>
        </Field>

        {/* AI 응답 언어 */}
        <Field
          label="AI 응답 언어"
          helper="학생이 시험 중 AI 튜터와 대화할 때 사용할 언어입니다."
        >
          <Select
            value={language}
            onValueChange={(value) => onLanguageChange(value as "ko" | "en")}
          >
            <SelectTrigger className="h-11 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ko">한국어 AI</SelectItem>
              <SelectItem value="en">English AI</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {/* 문제 — "+" 버튼이 문제 추가 Dialog(유형/개수/AI 프롬프트)를 연다. */}
        <Field
          label="문제"
          required
          helper={
            questions.length > 0
              ? `${questions.length}개 작성됨`
              : "최소 1개 이상 필요합니다."
          }
        >
          <div className="space-y-3" data-testid="manual-questions-section">
            {questions.map((question, index) => (
              <div
                key={question.id}
                className={`relative transition-all duration-500 ${
                  highlightedIds?.has(question.id)
                    ? "rounded-md ring-2 ring-primary ring-offset-2"
                    : ""
                }`}
              >
                {questions.length > 1 && (
                  <div className="absolute right-3 top-11 z-10 flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      disabled={index === 0}
                      onClick={() => onQuestionMove(index, "up")}
                      aria-label="위로 이동"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-7"
                      disabled={index === questions.length - 1}
                      onClick={() => onQuestionMove(index, "down")}
                      aria-label="아래로 이동"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <QuestionEditor
                  question={question}
                  index={index}
                  onUpdate={onQuestionUpdate}
                  onRemove={onQuestionRemove}
                  onAIEdit={() => setSheetQuestionId(question.id)}
                  mode="exam"
                  variant="line"
                />
              </div>
            ))}

            {/* "+" 문제 추가 트리거 — 클릭 시 문제 추가 Dialog 를 연다. */}
            {questions.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(true)}
                className="flex min-h-28 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/50"
                data-testid="empty-add-question-btn"
              >
                <Plus className="mr-2 h-4 w-4" />첫 문제 추가
              </button>
            ) : (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAddPickerOpen(true)}
                  className="size-10 rounded-full"
                  aria-label="문제 추가"
                  data-testid="add-question-btn"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </Field>

        {/* 평가 기준 */}
        <Field
          label="평가 기준"
          optional
          helper="AI 채점에 사용할 기준입니다. 비워두면 기본 기준으로 채점됩니다."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  onAIGenerateRubric({
                    topics: rubricTopics.trim() || undefined,
                    customInstructions:
                      rubricInstructions.trim() || undefined,
                  })
                }
                disabled={isAIGeneratingRubric}
                className="gap-1.5"
              >
                {isAIGeneratingRubric ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI 생성
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowRubricDetails((prev) => !prev)}
              >
                {showRubricDetails ? "접기" : "편집"}
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="simple-rubric-public" className="text-sm">
                  학생에게 공개
                </Label>
                <Switch
                  id="simple-rubric-public"
                  checked={isRubricPublic}
                  onCheckedChange={onRubricPublicChange}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rubric-topics" className="text-sm">
                  주제 / 키워드
                </Label>
                <Input
                  id="rubric-topics"
                  value={rubricTopics}
                  onChange={(e) => setRubricTopics(e.target.value)}
                  placeholder="예: 주요 개념, 특정 주제, 응용 사례"
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rubric-instructions" className="text-sm">
                  추가 지시사항{" "}
                  <span className="font-normal text-muted-foreground">
                    (선택)
                  </span>
                </Label>
                <Input
                  id="rubric-instructions"
                  value={rubricInstructions}
                  onChange={(e) => setRubricInstructions(e.target.value)}
                  placeholder="예: 한국 기업 사례를 활용해주세요"
                  maxLength={1000}
                />
              </div>
            </div>

            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  onRubricAdd();
                  setShowRubricDetails(true);
                }}
                className="size-10 rounded-full"
                aria-label="평가 기준 추가"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {pendingAISuggestions.length > 0 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    AI 제안 {pendingAISuggestions.length}개
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDismissAISuggestions}
                  >
                    무시
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onAcceptAISuggestions}
                  >
                    적용
                  </Button>
                </div>
              </div>
            )}

            {showRubricDetails && (
              <div className="space-y-2">
                {rubric.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    평가 기준이 없으면 기본 기준으로 채점됩니다.
                  </p>
                ) : (
                  rubric.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-md border p-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]"
                    >
                      <Textarea
                        value={item.evaluationArea}
                        onChange={(e) =>
                          onRubricUpdate(
                            item.id,
                            "evaluationArea",
                            e.target.value,
                          )
                        }
                        placeholder="평가 영역"
                        className="min-h-11 resize-y"
                      />
                      <Textarea
                        value={item.detailedCriteria}
                        onChange={(e) =>
                          onRubricUpdate(
                            item.id,
                            "detailedCriteria",
                            e.target.value,
                          )
                        }
                        placeholder="세부 기준"
                        className="min-h-11 resize-y"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onRubricRemove(item.id)}
                        className="text-destructive hover:text-destructive"
                        aria-label="평가 기준 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  채점 비중: 대화 {effectiveWeight}% / 최종 답안{" "}
                  {100 - effectiveWeight}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedGrading((prev) => !prev)}
                  className="ml-auto"
                >
                  조정
                </Button>
              </div>
              {showAdvancedGrading && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="simple-custom-weight"
                      checked={isCustomWeight}
                      onCheckedChange={(checked) =>
                        onChatWeightChange(checked ? 50 : null)
                      }
                    />
                    <Label
                      htmlFor="simple-custom-weight"
                      className="text-sm"
                    >
                      직접 설정
                    </Label>
                  </div>
                  {isCustomWeight && (
                    <Slider
                      value={[effectiveWeight]}
                      onValueChange={([value]) => onChatWeightChange(value)}
                      min={0}
                      max={100}
                      step={10}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </Field>
      </div>

      <div className="sticky bottom-4 z-20 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant={ready ? "default" : "outline"}>
                {ready ? "출제 가능" : "확인 필요"}
              </Badge>
              <Badge variant="outline">
                {duration === 0 ? "무제한" : `${duration}분`}
              </Badge>
              <Badge variant="outline">문제 {questions.length}개</Badge>
              <Badge variant="outline">
                루브릭 {rubric.length > 0 ? `${rubric.length}개` : "없음"}
              </Badge>
              <Badge variant="outline">{materialSummary}</Badge>
              <Badge variant="outline">
                {isRubricPublic ? "루브릭 공개" : "루브릭 비공개"}
              </Badge>
            </div>
            {submitReasons.length > 0 && (
              <div
                className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                data-testid="create-exam-submit-reasons"
              >
                {submitReasons.map((reason) => (
                  <span key={reason}>• {reason}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting || !ready}>
              {isSubmitting ? "출제 중..." : "출제하기"}
            </Button>
          </div>
        </div>
      </div>

      {/*
        AI 에이전트 실행 레이어가 쓰는 숨은 문제 생성기.
        다이얼로그 UI 에서는 AI 생성을 제거했지만, 에이전트 ref 핸들이
        살아 있도록 시각적으로 숨겨 마운트만 유지한다.
      */}
      <div className="sr-only" aria-hidden>
        {generator}
      </div>

      {/* 문제 추가 Dialog — 문제 유형만 고른다. */}
      <Dialog open={isAddPickerOpen} onOpenChange={setIsAddPickerOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          data-testid="add-question-picker"
        >
          <DialogHeader>
            <DialogTitle>문제 추가</DialogTitle>
            <DialogDescription>
              추가할 문제 유형을 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <QuestionTypePicker value={pickedType} onChange={setPickedType} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-question-count" className="text-sm">
                개수
              </Label>
              <Select
                value={pickedCount.toString()}
                onValueChange={(value) =>
                  setPickedCount(Number.parseInt(value, 10))
                }
              >
                <SelectTrigger
                  id="add-question-count"
                  className="h-9 w-20"
                  data-testid="add-question-count"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n}개
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => {
                onQuestionAdd(pickedType, pickedCount);
                setIsAddPickerOpen(false);
                setPickedCount(1);
              }}
              data-testid="manual-add-question-btn"
            >
              추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {sheetQuestion && (
        <QuestionAdjustSheet
          open={sheetQuestionId !== null}
          onOpenChange={(open) => {
            if (!open) setSheetQuestionId(null);
          }}
          questionText={sheetQuestion.text}
          history={sheetHistory}
          isAdjusting={isAdjusting}
          onSendInstruction={handleAdjust}
          onApply={handleApplyAdjustment}
        />
      )}
    </div>
  );
}
