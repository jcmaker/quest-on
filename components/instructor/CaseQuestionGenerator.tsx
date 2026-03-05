"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
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
import { Sparkles, ChevronDown, X, Plus, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import {
  useQuestionGeneration,
  type RubricItem,
} from "@/hooks/useQuestionGeneration";
import { GeneratedQuestionCard } from "./GeneratedQuestionCard";
import { QuestionSkeletonCard } from "./QuestionSkeletonCard";
import type { Question } from "./QuestionEditor";

interface CaseQuestionGeneratorProps {
  examTitle: string;
  extractedTexts: Map<string, { text: string; fileName: string }>;
  extractionStatus?: Map<string, "extracting" | "done" | "failed">;
  onQuestionsAccepted: (questions: Question[]) => void;
  onRubricSuggested: (rubric: RubricItem[]) => void;
}

function getStageMessage(stage: string, current: number, total: number): string {
  switch (stage) {
    case "started":
      return "시험 내용 분석 중...";
    case "generating":
      return total > 1
        ? `문제 생성 중 (${current}/${total})...`
        : "문제 생성 중...";
    case "complete":
      return "생성 완료!";
    default:
      return "준비 중...";
  }
}

export function CaseQuestionGenerator({
  examTitle,
  extractedTexts,
  extractionStatus,
  onQuestionsAccepted,
  onRubricSuggested,
}: CaseQuestionGeneratorProps) {
  const [isOpen, setIsOpen] = useState(true);
  const difficulty = "basic" as const;
  const [questionCount, setQuestionCount] = useState(1);
  const [topics, setTopics] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  const {
    generatedQuestions,
    suggestedRubric,
    isGenerating,
    regeneratingId,
    adjustingId,
    error,
    generationProgress,
    generateStream,
    cancelGeneration,
    regenerateOne,
    removeQuestion,
    adjustQuestion,
    applyAdjustment,
    getAdjustHistory,
    acceptQuestion,
    acceptAll,
  } = useQuestionGeneration();

  // Show toast when generation completes successfully
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (wasGeneratingRef.current && !isGenerating && generationProgress.stage === "complete" && !error) {
      toast.success("문제 생성이 완료되었습니다.");
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, generationProgress.stage, error]);

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

    await generateStream(getGenerateParams());
  };

  // P1-5: Track if rubric has been suggested to avoid duplicate toasts
  const rubricSuggestedRef = useRef(false);

  const applyRubricIfNeeded = () => {
    if (suggestedRubric.length > 0 && !rubricSuggestedRef.current) {
      onRubricSuggested(suggestedRubric);
      rubricSuggestedRef.current = true;
      toast.success("루브릭이 자동으로 제안되었습니다.", { icon: "📋" });
    }
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
      applyRubricIfNeeded();
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
      applyRubricIfNeeded();
      toast.success(`${all.length}개 문제가 추가되었습니다.`);
    }
  };

  const isDisabled = !examTitle.trim();

  // Calculate how many skeleton cards to show (based on batch progress, not total questions)
  const skeletonCount = isGenerating
    ? Math.max(0, generationProgress.total - generationProgress.current)
    : 0;

  const isMultiQuestion = generationProgress.total > 1;
  const progressPercent =
    isMultiQuestion && generationProgress.total > 0
      ? (generationProgress.current / generationProgress.total) * 100
      : 0;

  const stageMessage = isGenerating
    ? getStageMessage(generationProgress.stage, generationProgress.current, generationProgress.total)
    : "";

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
                placeholder="예: 주요 개념, 특정 주제, 응용 사례"
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

            {/* Materials info - P2-2: Show file details */}
            {(extractedTexts.size > 0 || (extractionStatus && extractionStatus.size > 0)) && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    업로드된 자료 {extractionStatus?.size || extractedTexts.size}개가 문제 생성에 활용됩니다.
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-1 pl-5">
                    {extractionStatus
                      ? Array.from(extractionStatus.entries()).map(([fileName, status]) => (
                          <div key={fileName} className="flex items-center gap-1.5 text-xs">
                            {status === "done" ? (
                              <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                            ) : status === "failed" ? (
                              <AlertCircle className="w-3 h-3 text-red-500" />
                            ) : (
                              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            )}
                            <span className={status === "failed" ? "text-red-500 line-through" : "text-muted-foreground"}>
                              {fileName}
                            </span>
                            {status === "failed" && (
                              <span className="text-red-500">(추출 실패)</span>
                            )}
                          </div>
                        ))
                      : Array.from(extractedTexts.values()).map(({ fileName }) => (
                          <div key={fileName} className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                            <span className="text-muted-foreground">{fileName}</span>
                          </div>
                        ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Generate / Cancel buttons */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={isDisabled || isGenerating}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                문제 생성하기
              </Button>
              {isGenerating && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancelGeneration}
                  className="gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  취소
                </Button>
              )}
            </div>
            {isDisabled && (
              <p className="text-xs text-muted-foreground">
                시험 제목을 먼저 입력해야 문제를 생성할 수 있습니다.
              </p>
            )}

            {/* Progress indicator during generation */}
            {isGenerating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{stageMessage}</span>
                  {isMultiQuestion && (
                    <span>{Math.round(progressPercent)}%</span>
                  )}
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  {isMultiQuestion ? (
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  ) : (
                    <motion.div
                      className="h-full w-2/5 bg-primary/70 rounded-full"
                      animate={{ x: ["-100%", "250%"] }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Generated questions + skeletons */}
            {(generatedQuestions.length > 0 || skeletonCount > 0) && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    생성된 문제
                  </h3>
                  {generatedQuestions.length > 1 && !isGenerating && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAcceptAll}
                      className="gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      전체 추가 ({generatedQuestions.length}개)
                    </Button>
                  )}
                </div>

                <AnimatePresence mode="popLayout">
                  {generatedQuestions.map((q, idx) => (
                    <motion.div
                      key={q.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      layout
                    >
                      <GeneratedQuestionCard
                        question={q}
                        index={idx}
                        isRegenerating={regeneratingId === q.id}
                        isAdjusting={adjustingId === q.id}
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
                    </motion.div>
                  ))}

                  {/* Skeleton cards for pending questions */}
                  {Array.from({ length: skeletonCount }, (_, i) => (
                    <motion.div
                      key={`skeleton-${generationProgress.current + i}`}
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      layout
                    >
                      <QuestionSkeletonCard
                        index={generationProgress.current + i}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
