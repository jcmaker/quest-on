"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Plus, ArrowUp, ArrowDown, ChevronDown, Pencil } from "lucide-react";
import { QuestionEditor } from "./QuestionEditor";
import type { Question } from "./QuestionEditor";
import { QuestionAdjustSheet } from "./QuestionAdjustSheet";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";
import toast from "react-hot-toast";

interface QuestionsListProps {
  questions: Question[];
  highlightedIds?: Set<string>;
  defaultOpen?: boolean;
  mode?: "exam" | "assignment";
  onUpdate: (
    id: string,
    field: keyof Question,
    value: string | boolean
  ) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  onMove?: (index: number, direction: "up" | "down") => void;
}

interface AdjustResult {
  questionText: string;
  explanation: string;
}

export function QuestionsList({ questions, highlightedIds, defaultOpen = true, mode = "exam", onUpdate, onRemove, onAdd, onMove }: QuestionsListProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustHistories, setAdjustHistories] = useState<Map<string, ChatMessage[]>>(new Map());
  const [sheetQuestionId, setSheetQuestionId] = useState<string | null>(null);

  const sheetQuestion = questions.find((q) => q.id === sheetQuestionId) ?? null;
  const sheetHistory = sheetQuestionId ? (adjustHistories.get(sheetQuestionId) ?? []) : [];

  const handleAdjust = useCallback(async (instruction: string): Promise<AdjustResult | null> => {
    if (!sheetQuestionId) return null;
    const question = questions.find((q) => q.id === sheetQuestionId);
    if (!question) return null;

    setIsAdjusting(true);
    setAdjustHistories((prev) => {
      const next = new Map(prev);
      const history = next.get(sheetQuestionId) ?? [];
      next.set(sheetQuestionId, [...history, { role: "user", content: instruction }]);
      return next;
    });

    try {
      const res = await fetch("/api/ai/adjust-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: sheetQuestionId, questionText: question.text, instruction }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as AdjustResult;

      setAdjustHistories((prev) => {
        const next = new Map(prev);
        const history = next.get(sheetQuestionId) ?? [];
        next.set(sheetQuestionId, [
          ...history,
          { role: "assistant", content: data.explanation, questionText: data.questionText },
        ]);
        return next;
      });
      return data;
    } catch {
      toast.error("수정에 실패했습니다.");
      return null;
    } finally {
      setIsAdjusting(false);
    }
  }, [sheetQuestionId, questions]);

  const handleApplyAdjustment = useCallback((newText: string) => {
    if (!sheetQuestionId) return;
    onUpdate(sheetQuestionId, "text", newText);
  }, [sheetQuestionId, onUpdate]);

  // Auto-expand when questions are added (e.g., from AI acceptance)
  useEffect(() => {
    if (questions.length > 0 && !isOpen) {
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  return (
    <>
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card data-testid="manual-questions-section">
        <CollapsibleTrigger asChild>
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-xl"
            data-testid="manual-questions-toggle"
          >
            <CardTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              문제 직접 작성
              {questions.length > 0 && (
                <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {questions.length}개
                </span>
              )}
            </CardTitle>
            <CardAction>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </CardAction>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{mode === "assignment" ? "과제 문제를 입력하세요" : "시험 문제를 입력하세요"}</p>
              {onAdd && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAdd}
                  className="gap-1.5"
                  data-testid="add-question-btn"
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
                      onAIEdit={() => setSheetQuestionId(question.id)}
                      mode={mode}
                    />
                  </div>
                ))}
              </div>
            )}
            {questions.length === 0 && onAdd && (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">아직 문제가 없습니다</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onAdd}
                  className="gap-1.5"
                  data-testid="empty-add-question-btn"
                >
                  <Plus className="w-4 h-4" />
                  첫 문제 추가하기
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

      {sheetQuestion && (
        <QuestionAdjustSheet
          open={sheetQuestionId !== null}
          onOpenChange={(open) => { if (!open) setSheetQuestionId(null); }}
          questionText={sheetQuestion.text}
          history={sheetHistory}
          isAdjusting={isAdjusting}
          onSendInstruction={handleAdjust}
          onApply={handleApplyAdjustment}
        />
      )}
    </>
  );
}
