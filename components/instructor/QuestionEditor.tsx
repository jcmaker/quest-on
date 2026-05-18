import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shine } from "@/components/ui/shine";
import dynamic from "next/dynamic";
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then(mod => mod.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-muted rounded-md" /> }
);
import { Hash, HelpCircle, MessageSquare, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Question {
  id: string;
  text: string;
  type: "multiple-choice" | "essay" | "short-answer";
  options?: string[];
  rubric?: Array<{ evaluationArea: string; detailedCriteria: string }>;
}

interface QuestionEditorProps {
  question: Question;
  index: number;
  onUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean
  ) => void;
  onRemove?: (id: string) => void;
  onAIEdit?: () => void;
  mode?: "exam" | "assignment";
  variant?: "card" | "line";
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
              {mode === "assignment" ? "과제 문제" : "시험 문제"}
            </Label>
          </div>
          <div className="flex items-center gap-1">
            {onAIEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAIEdit}
                className="h-8 gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                AI 다듬기
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
                AI로 문제 다듬기
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
          난이도 조절 · 표현 개선 · 분량 조정
        </p>
      )}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>{mode === "assignment" ? "과제 문제" : "시험 문제"}</Label>
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
