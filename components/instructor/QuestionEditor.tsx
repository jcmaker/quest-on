import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then(mod => mod.RichTextEditor),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-muted rounded-md" /> }
);
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hash, HelpCircle, Trash2 } from "lucide-react";
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
  correctAnswer?: string;
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
}

export function QuestionEditor({
  question,
  index,
  onUpdate,
  onRemove,
}: QuestionEditorProps) {
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
            variant="default"
            className="text-base font-semibold px-3 py-1 h-8 flex items-center gap-1.5"
          >
            <Hash className="h-4 w-4" />
            {index + 1}
          </Badge>
          <div className="h-6 w-px bg-border"></div>
          <span className="text-sm text-muted-foreground">문제 출제 중</span>
        </div>
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
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>문제 유형</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  문제 유형을 선택하세요. Problem Solving Type은 서술형 문제,
                  STEM Problem Type은 과학/수학 문제에 적합합니다.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={question.type}
            onValueChange={(value) => onUpdate(question.id, "type", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="essay">Problem Solving Type</SelectItem>
              <SelectItem value="short-answer">STEM Problem Type</SelectItem>
              <SelectItem value="multiple-choice" disabled>
                Type C
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>시험 문제</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">시험 문제를 입력하세요.</p>
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
