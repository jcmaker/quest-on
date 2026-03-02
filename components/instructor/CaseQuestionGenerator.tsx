"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  useQuestionGeneration,
  type GeneratedQuestion,
  type RubricItem,
} from "@/hooks/useQuestionGeneration";
import { GeneratedQuestionCard } from "./GeneratedQuestionCard";
import type { Question } from "./QuestionEditor";

interface CaseQuestionGeneratorProps {
  examTitle: string;
  extractedTexts: Map<string, { text: string; fileName: string }>;
  onQuestionsAccepted: (questions: Question[]) => void;
  onRubricSuggested: (rubric: RubricItem[]) => void;
}

export function CaseQuestionGenerator({
  examTitle,
  extractedTexts,
  onQuestionsAccepted,
  onRubricSuggested,
}: CaseQuestionGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<
    "basic" | "intermediate" | "advanced"
  >("intermediate");
  const [questionCount, setQuestionCount] = useState(2);
  const [topics, setTopics] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  const {
    generatedQuestions,
    suggestedRubric,
    isGenerating,
    isAdjusting,
    error,
    generate,
    regenerateOne,
    removeQuestion,
    adjustQuestion,
    applyAdjustment,
    getAdjustHistory,
    acceptQuestion,
    acceptAll,
  } = useQuestionGeneration();

  const getGenerateParams = () => {
    const materialsText = Array.from(extractedTexts.entries()).map(
      ([url, { text, fileName }]) => ({
        url,
        text,
        fileName,
      })
    );

    return {
      examTitle,
      difficulty,
      questionCount,
      topics: topics || undefined,
      customInstructions: customInstructions || undefined,
      materialsText: materialsText.length > 0 ? materialsText : undefined,
    };
  };

  const handleGenerate = async () => {
    if (!examTitle.trim()) {
      toast.error("시험 제목을 먼저 입력해주세요.");
      return;
    }

    await generate(getGenerateParams());
  };

  const handleAcceptOne = (questionId: string) => {
    const q = acceptQuestion(questionId);
    if (q) {
      onQuestionsAccepted([
        {
          id: q.id,
          text: q.text,
          type: q.type as Question["type"],
        },
      ]);
      toast.success("문제가 추가되었습니다.");
    }
  };

  const handleAcceptAll = () => {
    const all = acceptAll();
    if (all.length > 0) {
      onQuestionsAccepted(
        all.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type as Question["type"],
        }))
      );
      if (suggestedRubric.length > 0) {
        onRubricSuggested(suggestedRubric);
      }
      toast.success(`${all.length}개 문제가 추가되었습니다.`);
    }
  };

  const isDisabled = !examTitle.trim();

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-semibold">AI 사례형 문제 생성</span>
              {generatedQuestions.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {generatedQuestions.length}개 생성됨
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
          <div className="px-6 pb-6 space-y-4 border-t pt-4">
            {/* Difficulty */}
            <div className="space-y-1.5">
              <Label className="text-sm">난이도</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "basic", label: "기초" },
                    { value: "intermediate", label: "중급" },
                    { value: "advanced", label: "심화" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={difficulty === opt.value ? "default" : "outline"}
                    onClick={() => setDifficulty(opt.value)}
                    className="h-8"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Question count */}
            <div className="space-y-1.5">
              <Label className="text-sm">생성할 문제 수</Label>
              <Select
                value={questionCount.toString()}
                onValueChange={(v) => setQuestionCount(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n}개
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Topics */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                특정 토픽{" "}
                <span className="text-muted-foreground font-normal">
                  (선택)
                </span>
              </Label>
              <Input
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="예: 독점시장, 가격차별, 파레토 최적"
                maxLength={500}
              />
            </div>

            {/* Custom instructions */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                추가 지시사항{" "}
                <span className="text-muted-foreground font-normal">
                  (선택)
                </span>
              </Label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="예: 한국 기업 사례를 활용해주세요"
                maxLength={2000}
                className="min-h-[60px] resize-none"
              />
            </div>

            {/* Materials info */}
            {extractedTexts.size > 0 && (
              <p className="text-xs text-muted-foreground">
                업로드된 자료 {extractedTexts.size}개가 문제 생성에 활용됩니다.
              </p>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Generate button */}
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isDisabled || isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  문제 생성하기
                </>
              )}
            </Button>
            {isDisabled && (
              <p className="text-xs text-muted-foreground">
                시험 제목을 먼저 입력해야 문제를 생성할 수 있습니다.
              </p>
            )}

            {/* Generated questions */}
            {generatedQuestions.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    생성된 문제
                  </h3>
                  {generatedQuestions.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAcceptAll}
                      className="h-7 text-xs"
                    >
                      전체 수락
                    </Button>
                  )}
                </div>

                {generatedQuestions.map((q, idx) => (
                  <GeneratedQuestionCard
                    key={q.id}
                    question={q}
                    index={idx}
                    rubric={suggestedRubric}
                    isGenerating={isGenerating}
                    isAdjusting={isAdjusting}
                    adjustHistory={getAdjustHistory(q.id)}
                    onAccept={() => handleAcceptOne(q.id)}
                    onRegenerate={() =>
                      regenerateOne(q.id, getGenerateParams())
                    }
                    onRemove={() => removeQuestion(q.id)}
                    onAdjust={async (instruction) => {
                      await adjustQuestion(q.id, instruction, examTitle);
                    }}
                    onApplyAdjustment={(newText) =>
                      applyAdjustment(q.id, newText)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
