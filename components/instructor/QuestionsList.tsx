import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, ArrowUp, ArrowDown } from "lucide-react";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";

interface QuestionsListProps {
  questions: Question[];
  highlightedIds?: Set<string>;
  onUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean
  ) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  onMove?: (index: number, direction: "up" | "down") => void;
}

export function QuestionsList({ questions, highlightedIds, onUpdate, onRemove, onAdd, onMove }: QuestionsListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>문제</CardTitle>
            <CardDescription>시험 문제를 입력하세요</CardDescription>
          </div>
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
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
