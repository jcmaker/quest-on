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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  RefreshCw,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";
import type {
  GeneratedQuestion,
  ChatMessage,
} from "@/hooks/useQuestionGeneration";
import { QuestionAdjustSheet } from "./QuestionAdjustSheet";

interface GeneratedQuestionCardProps {
  question: GeneratedQuestion;
  index: number;
  isRegenerating: boolean;
  isAdjusting: boolean;
  adjustHistory: ChatMessage[];
  onAccept: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onAdjust: (instruction: string) => Promise<void>;
  onApplyAdjustment: (newText: string) => void;
}

export function GeneratedQuestionCard({
  question,
  index,
  isRegenerating,
  isAdjusting,
  adjustHistory,
  onAccept,
  onRegenerate,
  onRemove,
  onAdjust,
  onApplyAdjustment,
}: GeneratedQuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [needsExpand, setNeedsExpand] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const PREVIEW_HEIGHT = 300;

  useEffect(() => {
    if (contentRef.current) {
      setNeedsExpand(contentRef.current.scrollHeight > PREVIEW_HEIGHT);
    }
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

        {/* Header — P1-7: Removed delete button from header */}
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">문제 {index + 1}</h4>
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

        {/* Per-question rubric (collapsible) */}
        {question.rubric && question.rubric.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                평가 기준 ({question.rubric.length}개)
                <ChevronDown className="w-3 h-3" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5 pl-5">
                {question.rubric.map((item, idx) => (
                  <div key={idx} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.evaluationArea}</span>
                    <span className="mx-1">—</span>
                    {item.detailedCriteria}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Footer actions — P1-1: "완료"→"추가", Check→Plus; P1-7: Delete button moved here */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={onAccept}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            문제 추가
          </Button>
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
