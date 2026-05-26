import type { KeyboardEvent } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shine } from "@/components/ui/shine";
import dynamic from "next/dynamic";
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then(mod => mod.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-muted rounded-md" /> }
);
import { Check, Hash, HelpCircle, MessageSquare, Sparkles, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Question {
  id: string;
  text: string;
  type: "multiple-choice" | "true-false" | "essay" | "short-answer";
  options?: string[];
  /** 객관식/OX 정답 선택지 인덱스 (objective 문제 전용). */
  correctOptionIndex?: number;
  /** 배점. UI/저장 전반에서 선택값으로 통일 — 미설정 시 표시하지 않는다. */
  points?: number;
  rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
}

/** 문제 유형별 한글 표기 — 추가 다이얼로그의 유형 선택기와 같은 어휘를 쓴다. */
const QUESTION_TYPE_LABELS: Record<Question["type"], string> = {
  "multiple-choice": "사지선다",
  "true-false": "O·X",
  essay: "사례형",
  "short-answer": "단답형",
};

type QuestionFieldValue = string | boolean | number | string[];

interface QuestionEditorProps {
  question: Question;
  index: number;
  onUpdate: (
    id: string,
    field: keyof Question,
    value: QuestionFieldValue
  ) => void;
  onRemove?: (id: string) => void;
  onAIEdit?: () => void;
  mode?: "exam" | "assignment";
  variant?: "card" | "line";
}

/**
 * 객관식/OX 문제의 선택지 편집기.
 * - multiple-choice: 4개 선택지를 2×2 그리드로, 텍스트 편집 + 정답 표시.
 * - true-false: O·X 2칸, 텍스트는 고정 — 정답 표시만 가능.
 */
function OptionEditor({
  question,
  onUpdate,
}: {
  question: Question;
  onUpdate: (
    id: string,
    field: keyof Question,
    value: QuestionFieldValue
  ) => void;
}) {
  const isTrueFalse = question.type === "true-false";
  const fallback = isTrueFalse ? ["O", "X"] : ["", "", "", ""];
  const options =
    question.options && question.options.length > 0
      ? question.options
      : fallback;

  const setCorrect = (idx: number) => {
    onUpdate(question.id, "correctOptionIndex", idx);
  };

  const setOptionText = (idx: number, text: string) => {
    const next = [...options];
    next[idx] = text;
    onUpdate(question.id, "options", next);
  };

  // 정답 라디오 — 방향키 이동(선택이 포커스를 따라감). QuestionTypePicker 와 동일 패턴.
  const hasSelection = typeof question.correctOptionIndex === "number";
  const handleRadioKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const nextIdx = (idx + delta + options.length) % options.length;
    setCorrect(nextIdx);
    document.getElementById(`${question.id}-option-${nextIdx}`)?.focus();
  };

  return (
    <div className="border-t p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        선택지를 입력하고 정답을 표시하세요.
      </p>
      <div
        role="radiogroup"
        aria-label="정답 선택지"
        className="grid grid-cols-2 gap-2"
      >
        {options.map((option, idx) => {
          const isCorrect = question.correctOptionIndex === idx;
          return (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded-md border p-2 transition-colors ${
                isCorrect
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background"
              }`}
            >
              <button
                type="button"
                role="radio"
                id={`${question.id}-option-${idx}`}
                aria-checked={isCorrect}
                aria-label={`${idx + 1}번 선택지를 정답으로 표시`}
                tabIndex={(hasSelection ? isCorrect : idx === 0) ? 0 : -1}
                onClick={() => setCorrect(idx)}
                onKeyDown={(e) => handleRadioKeyDown(e, idx)}
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isCorrect
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent hover:border-foreground/40"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              {isTrueFalse ? (
                <span className="text-sm font-medium">{option}</span>
              ) : (
                <Input
                  value={option}
                  onChange={(e) => setOptionText(idx, e.target.value)}
                  placeholder={`선택지 ${idx + 1}`}
                  className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                  aria-label={`${idx + 1}번 선택지 내용`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QuestionEditor({
  question,
  index,
  onUpdate,
  onRemove,
  onAIEdit,
  mode = "exam",
  variant = "card",
}: QuestionEditorProps) {
  const isObjective =
    question.type === "multiple-choice" || question.type === "true-false";
  const isEmpty =
    !question.text ||
    question.text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";

  if (variant === "line") {
    return (
      <div
        className="rounded-md border bg-background"
        data-testid={`question-editor-${index}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="h-7 border-primary/30 bg-primary/5 text-primary"
            >
              <Hash className="h-3.5 w-3.5" />
              {index + 1}
            </Badge>
            <Label className="text-sm">
              {QUESTION_TYPE_LABELS[question.type]}
            </Label>
          </div>
          <div className="flex items-center gap-1">
            {onAIEdit && (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={onAIEdit}
                className="h-8 gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isEmpty ? "AI 생성" : "AI 수정"}
              </Button>
            )}
            {onRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => onRemove(question.id)}
                    className="size-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>문제 삭제</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <RichTextEditor
          value={question.text}
          onChange={(value) => onUpdate(question.id, "text", value)}
          placeholder="문제를 입력하세요"
          className="rounded-t-none border-0"
          contentClassName="prose max-w-none focus:outline-none min-h-[140px] p-3"
          testId={`question-editor-input-${index}`}
        />
        {isObjective && (
          <OptionEditor question={question} onUpdate={onUpdate} />
        )}
      </div>
    );
  }

  return (
    <div
      className="border rounded-lg p-5 bg-card shadow-sm relative overflow-hidden"
      data-testid={`question-editor-${index}`}
    >
      {/* 문제 번호 인디케이터 */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/60"></div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="text-base font-semibold px-3 py-1 h-8 flex items-center gap-1.5 text-primary border-primary/30 bg-primary/5"
          >
            <Hash className="h-4 w-4" />
            {index + 1}
          </Badge>
          <div className="h-6 w-px bg-border"></div>
          <span className="text-sm text-muted-foreground">문제 출제 중</span>
        </div>
        <div className="flex items-center gap-1">
          {onAIEdit && (
            <Shine
              className="rounded-full"
              duration={1200}
              loop
              loopDelay={1400}
              opacity={0.24}
            >
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={onAIEdit}
                className="relative overflow-hidden gap-1.5 rounded-full"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {isEmpty ? "AI 생성" : "AI 수정"}
              </Button>
            </Shine>
          )}
          {onRemove && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onRemove(question.id)}
                  className="size-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>문제 삭제</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {onAIEdit && (
        <p className="text-xs text-muted-foreground mb-4">
          {isEmpty ? "AI로 문제를 생성하세요" : "AI로 문제, 선택지, 정답을 수정"}
        </p>
      )}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>{QUESTION_TYPE_LABELS[question.type]}</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{mode === "assignment" ? "과제 문제를 입력하세요." : "시험 문제를 입력하세요."}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <RichTextEditor
            value={question.text}
            onChange={(value) => onUpdate(question.id, "text", value)}
            placeholder="여기에 문제를 입력하세요..."
            className="min-h-[300px]"
            testId={`question-editor-input-${index}`}
          />
        </div>
      </div>
    </div>
  );
}
