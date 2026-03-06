import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, ArrowUp, ArrowDown, ChevronDown, Pencil } from "lucide-react";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";

interface QuestionsListProps {
  questions: Question[];
  highlightedIds?: Set<string>;
  defaultOpen?: boolean;
  onUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean
  ) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  onMove?: (index: number, direction: "up" | "down") => void;
}

export function QuestionsList({ questions, highlightedIds, defaultOpen = true, onUpdate, onRemove, onAdd, onMove }: QuestionsListProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Auto-expand when questions are added (e.g., from AI acceptance)
  useEffect(() => {
    if (questions.length > 0 && !isOpen) {
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              <span className="font-semibold">문제 직접 작성</span>
              {questions.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {questions.length}개
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-6 border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">시험 문제를 입력하세요</p>
              {onAdd && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAdd}
                  className="gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  문제 추가
                </Button>
              )}
            </div>
            {questions.length > 0 && (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div
                    key={question.id}
                    className={`relative transition-all duration-500 ${
                      highlightedIds?.has(question.id)
                        ? "ring-2 ring-primary ring-offset-2 rounded-lg animate-pulse"
                        : ""
                    }`}
                  >
                    {onMove && questions.length > 1 && (
                      <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 z-10 max-sm:hidden">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === 0}
                          onClick={() => onMove(index, "up")}
                          aria-label="위로 이동"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === questions.length - 1}
                          onClick={() => onMove(index, "down")}
                          aria-label="아래로 이동"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                    <QuestionEditor
                      question={question}
                      index={index}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                    />
                  </div>
                ))}
              </div>
            )}
            {questions.length === 0 && onAdd && (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">아직 문제가 없습니다</p>
                <Button type="button" variant="outline" onClick={onAdd} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  첫 문제 추가하기
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
