"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import {
  Check,
  RefreshCw,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  GeneratedQuestion,
  RubricItem,
  ChatMessage,
} from "@/hooks/useQuestionGeneration";
import { QuestionAdjustSheet } from "./QuestionAdjustSheet";

interface GeneratedQuestionCardProps {
  question: GeneratedQuestion;
  index: number;
  rubric: RubricItem[];
  isGenerating: boolean;
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
  rubric,
  isGenerating,
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

  const PREVIEW_HEIGHT = 300;

  return (
    <>
      <div className="border rounded-lg p-4 space-y-3 bg-card">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">문제 {index + 1}</h4>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onAccept}
              className="h-7 text-xs gap-1"
            >
              <Check className="w-3 h-3" />
              수락
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw
                className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`}
              />
              재생성
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSheetOpen(true)}
              className="h-7 text-xs gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              수정 대화
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="h-7 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Question content */}
        <div className="relative">
          <div
            className={`overflow-hidden transition-all ${
              isExpanded ? "" : ""
            }`}
            style={{
              maxHeight: isExpanded ? "none" : `${PREVIEW_HEIGHT}px`,
            }}
          >
            <RichTextViewer content={question.text} className="prose-sm" />
          </div>

          {/* Gradient overlay when collapsed */}
          {!isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>

        {/* Expand/collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-7 text-xs text-muted-foreground"
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

        {/* Suggested rubric */}
        {rubric.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              제안된 루브릭
            </p>
            <div className="space-y-1">
              {rubric.map((item, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium">{item.evaluationArea}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {item.detailedCriteria}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
