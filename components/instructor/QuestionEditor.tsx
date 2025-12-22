import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Hash, HelpCircle } from "lucide-react";
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
  onRemove: (id: string) => void;
}

export function QuestionEditor({
  question,
  index,
  onUpdate,
  onRemove,
}: QuestionEditorProps) {
  return (
    <div className="border rounded-lg p-5 bg-card shadow-sm relative overflow-hidden">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onRemove(question.id);
          }}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          삭제
        </Button>
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
          <select
            value={question.type}
            onChange={(e) => onUpdate(question.id, "type", e.target.value)}
            className="w-full p-2 border rounded-md"
          >
            <option value="essay">Problem Solving Type</option>
            <option value="short-answer">STEM Problem Type</option>
            <option value="multiple-choice" disabled>
              Type C
            </option>
          </select>
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
          />
        </div>
      </div>
    </div>
  );
}
