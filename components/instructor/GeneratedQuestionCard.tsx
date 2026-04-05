"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import type {
  GeneratedQuestion,
  ChatMessage,
} from "@/hooks/useQuestionGeneration";
import { QuestionAdjustSheet } from "./QuestionAdjustSheet";

const BASE_PRESETS = [
  { label: "더 어렵게", instruction: "난이도를 높여주세요. 더 복잡한 조건과 깊은 분석을 요구하도록 수정해주세요." },
  { label: "더 쉽게", instruction: "난이도를 낮춰주세요. 조건을 단순화하고 질문을 더 명확하게 만들어주세요." },
  { label: "더 길게", instruction: "시나리오를 더 상세하게 만들고 하위 질문을 추가해주세요." },
  { label: "보기 추가", instruction: "각 하위 질문에 4개의 선택지(보기)를 추가하여 객관식으로 변환해주세요." },
];

interface AdjustResult {
  questionText: string;
  explanation: string;
}

interface GeneratedQuestionCardProps {
  question: GeneratedQuestion;
  index: number;
  isRegenerating: boolean;
  isAdjusting: boolean;
  adjustHistory: ChatMessage[];
  onAccept?: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onAdjust: (instruction: string) => Promise<AdjustResult | null>;
  onApplyAdjustment: (newText: string) => void;
  isAnyAdjusting: boolean;
}

export function GeneratedQuestionCard({
  question,
  index,
  isRegenerating,
  isAdjusting,
  adjustHistory,
  onRegenerate,
  onRemove,
  onAdjust,
  onApplyAdjustment,
  isAnyAdjusting,
}: GeneratedQuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);
  const [quickAdjustingPreset, setQuickAdjustingPreset] = useState<string | null>(null);
  const [isEnglish, setIsEnglish] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const PREVIEW_HEIGHT = 300;

  const langPreset = isEnglish
    ? { label: "한국어로", instruction: "이 문제를 한국어로 번역해주세요. 시나리오와 질문 모두 한국어로 작성해주세요." }
    : { label: "영어로", instruction: "이 문제를 영어로 번역해주세요. 시나리오와 질문 모두 영어로 작성해주세요." };

  const presets = [...BASE_PRESETS.slice(0, 3), langPreset, BASE_PRESETS[3]];

  useEffect(() => {
    if (contentRef.current) {
      setNeedsExpand(contentRef.current.scrollHeight > PREVIEW_HEIGHT);
    }
    setIsEnglish(false);
  }, [question.text]);

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-card relative">
        {/* Regeneration overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 bg-card/80 backdrop-blur-[2px] rounded-lg z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              재생성 중...
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">AI 생성 미리보기 {index + 1}</h4>
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">미리보기</span>
          </div>
        </div>

        {/* Question content */}
        <div className="relative">
          <div
            ref={contentRef}
            className="overflow-hidden transition-all"
            style={{
              maxHeight: isExpanded || !needsExpand ? "none" : `${PREVIEW_HEIGHT}px`,
            }}
          >
            <RichTextViewer content={question.text} className="prose-sm" />
          </div>

          {/* Gradient overlay when collapsed */}
          {!isExpanded && needsExpand && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>

        {/* Expand/collapse toggle */}
        {needsExpand && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                더 보기
              </>
            )}
          </Button>
        )}


        {/* Quick-modify preset buttons */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              disabled={isAnyAdjusting || isRegenerating}
              className="rounded-full text-xs h-7 px-3"
              onClick={async () => {
                setQuickAdjustingPreset(preset.label);
                try {
                  const result = await onAdjust(preset.instruction);
                  if (result) {
                    onApplyAdjustment(result.questionText);
                    if (preset.label === "영어로") setIsEnglish(true);
                    if (preset.label === "한국어로") setIsEnglish(false);
                    toast.success(`"${preset.label}" 수정이 적용되었습니다.`);
                  }
                } catch {
                  toast.error("수정에 실패했습니다.");
                } finally {
                  setQuickAdjustingPreset(null);
                }
              }}
            >
              {quickAdjustingPreset === preset.label && (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              )}
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsSheetOpen(true)}
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI와 수정
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="gap-1.5"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
            />
            재생성
          </Button>
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onRemove}
                  className="size-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>삭제</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Adjust Sheet */}
      <QuestionAdjustSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        questionText={question.text}
        history={adjustHistory}
        isAdjusting={isAdjusting}
        onSendInstruction={onAdjust}
        onApply={onApplyAdjustment}
      />
    </>
  );
}
