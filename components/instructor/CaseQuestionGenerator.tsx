"use client";

import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  type Ref,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import {
  Sparkles,
  ChevronDown,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  useQuestionGeneration,
  type RubricItem,
} from "@/hooks/useQuestionGeneration";
import { GeneratedQuestionCard } from "./GeneratedQuestionCard";
import { QuestionSkeletonCard } from "./QuestionSkeletonCard";
import type { Question } from "./QuestionEditor";

/**
 * AI 에이전트가 생성기를 프로그램적으로 조작하기 위한 명령형 핸들.
 * 강사 AI 에이전트의 클라이언트 실행 레이어가 ref 로 받아 사용한다.
 * 일반(비에이전트) 사용에는 영향이 없다.
 */
export interface CaseQuestionGeneratorHandle {
  /** freeform(주제) textarea 의 DOM 요소 — 체화 애니메이션 타깃. */
  getFreeformElement: () => HTMLTextAreaElement | null;
  /** 문제 수 Select 트리거의 DOM 요소 — 체화 애니메이션 타깃. */
  getCountElement: () => HTMLElement | null;
  /** 생성 버튼 DOM 요소 — 체화 애니메이션 타깃. */
  getGenerateButtonElement: () => HTMLButtonElement | null;
  /** freeform(주제) 입력값 직접 설정 (controlled state). */
  setFreeformPrompt: (value: string) => void;
  /** 현재 freeform(주제) 입력값. */
  getFreeformPrompt: () => string;
  /** 생성할 문제 수 설정 (1~5 로 클램프). */
  setQuestionCount: (count: number) => void;
  /** 현재 생성 진행 여부. */
  getIsGenerating: () => boolean;
  /** 기존 handleGenerate 를 재활용해 생성을 트리거. */
  triggerGenerate: () => Promise<void>;
}

interface CaseQuestionGeneratorProps {
  examTitle: string;
  extractedTexts?: Map<string, { text: string; fileName: string }>;
  extractionStatus?: Map<
    string,
    "uploading" | "extracting" | "done" | "failed"
  >;
  onQuestionsAccepted: (questions: Question[]) => void;
  onRubricSuggested: (rubric: RubricItem[]) => void;
  language?: "ko" | "en";
  mode?: "exam" | "assignment";
  variant?: "card" | "line";
  /** AI 에이전트 실행 레이어가 생성기를 프로그램적으로 조작하기 위한 ref. */
  agentHandleRef?: Ref<CaseQuestionGeneratorHandle>;
}

function getStageMessage(
  stage: string,
  current: number,
  total: number,
): string {
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
  language,
  mode = "exam",
  variant = "card",
  agentHandleRef,
}: CaseQuestionGeneratorProps) {
  const [isOpen, setIsOpen] = useState(true);
  const difficulty = "basic" as const;
  const [questionCount, setQuestionCount] = useState(1);
  const [freeformPrompt, setFreeformPrompt] = useState("");
  const isAssignmentMode = mode === "assignment";

  // AI 에이전트 체화 애니메이션이 가리킬 DOM 요소 ref.
  const freeformElementRef = useRef<HTMLTextAreaElement>(null);
  const countElementRef = useRef<HTMLButtonElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const availableTexts = extractedTexts ?? new Map<string, { text: string; fileName: string }>();

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
    acceptAll,
  } = useQuestionGeneration();

  // Auto-apply all questions when generation completes
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (
      wasGeneratingRef.current &&
      !isGenerating &&
      generationProgress.stage === "complete" &&
      !error
    ) {
      const all = acceptAll();
      if (all.length > 0) {
        onQuestionsAccepted(
          all.map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type as Question["type"],
            options: q.options,
            correctOptionIndex: q.correctOptionIndex,
            // 객관식/OX 는 결정론 채점이라 루브릭이 없다.
            rubric: q.rubric,
          })),
        );
        applyRubricIfNeeded();
        toast.success(`${all.length}개 문제가 추가되었습니다.`);
      }
    }
    wasGeneratingRef.current = isGenerating;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, generationProgress.stage, error]);

  const getGenerateParams = () => {
    const materialsText = Array.from(availableTexts.entries()).map(
      ([url, { text, fileName }]) => ({
        url,
        text,
        fileName,
      }),
    );

    return {
      examTitle,
      difficulty,
      questionCount,
      customInstructions: freeformPrompt || undefined,
      materialsText: !isAssignmentMode && materialsText.length > 0 ? materialsText : undefined,
      language,
      generationMode: isAssignmentMode ? "research-assignment" as const : "case" as const,
    };
  };

  const handleGenerate = async () => {
    if (!examTitle.trim()) {
      toast.error(isAssignmentMode ? "과제 제목을 먼저 입력해주세요." : "시험 제목을 먼저 입력해주세요.");
      return;
    }

    if (isAssignmentMode && !freeformPrompt.trim()) {
      toast.error("학생에게 시킬 리서치 주제를 입력해주세요.");
      return;
    }

    await generateStream(getGenerateParams());
  };

  // ── AI 에이전트 명령형 핸들 ──────────────────────────────────────
  // 에이전트 실행 레이어가 ref 로 받아 생성기를 프로그램적으로 조작한다.
  // 기존 handleGenerate / state setter 를 그대로 재활용한다.
  useImperativeHandle(
    agentHandleRef,
    (): CaseQuestionGeneratorHandle => ({
      getFreeformElement: () => freeformElementRef.current,
      getCountElement: () => countElementRef.current,
      getGenerateButtonElement: () => generateButtonRef.current,
      setFreeformPrompt: (value) => setFreeformPrompt(value),
      getFreeformPrompt: () => freeformPrompt,
      setQuestionCount: (count) => {
        const clamped = Math.min(5, Math.max(1, Math.round(count)));
        setQuestionCount(clamped);
      },
      getIsGenerating: () => isGenerating,
      // handleGenerate 가 generateStream 을 await 하므로
      // 이 Promise 는 스트리밍(=생성)이 끝날 때 resolve 된다.
      triggerGenerate: () => handleGenerate(),
    }),
    // 의존성 배열 생략 — 매 렌더 핸들을 갱신해 메서드가 항상 최신
    // state/handleGenerate 를 참조하게 한다. ref 소비자(에이전트 실행기)는
    // 핸들 객체 정체성에 의존하지 않으므로 무해하다.
  );

  // P1-5: Track if rubric has been suggested to avoid duplicate toasts
  const rubricSuggestedRef = useRef(false);

  const applyRubricIfNeeded = () => {
    if (!isAssignmentMode && suggestedRubric.length > 0 && !rubricSuggestedRef.current) {
      onRubricSuggested(suggestedRubric);
      rubricSuggestedRef.current = true;
      toast("AI 루브릭 제안을 확인하세요.", { icon: "📋" });
    }
  };

  const isDisabled = !examTitle.trim() || (isAssignmentMode && !freeformPrompt.trim());

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
    ? getStageMessage(
        generationProgress.stage,
        generationProgress.current,
        generationProgress.total,
      )
    : "";
  const displayStageMessage = isAssignmentMode
    ? stageMessage.replace("시험 내용", "리서치 과제")
    : stageMessage;

  if (variant === "line") {
    return (
      <div className="space-y-3" data-testid="simple-ai-generator">
        <div className="grid gap-2 lg:grid-cols-[112px_minmax(0,1fr)_auto]">
          <Select
            value={questionCount.toString()}
            onValueChange={(v) => setQuestionCount(Number(v))}
          >
            <SelectTrigger ref={countElementRef} className="h-11">
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
          <Textarea
            ref={freeformElementRef}
            value={freeformPrompt}
            onChange={(e) => setFreeformPrompt(e.target.value)}
            placeholder={
              isAssignmentMode
                ? "예: 국내 배달앱 3사의 최근 수익성 변화를 조사해오시오"
                : "예: 한국 기업 사례 중심으로 1문제 만들어줘"
            }
            maxLength={2000}
            className="min-h-11 resize-none py-2.5"
          />
          <div className="flex gap-2">
            <Button
              ref={generateButtonRef}
              type="button"
              onClick={handleGenerate}
              disabled={isDisabled || isGenerating}
              className="h-11 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? "생성 중" : "생성"}
            </Button>
            {isGenerating && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={cancelGeneration}
                className="size-11"
                aria-label="생성 취소"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {!isAssignmentMode &&
          (availableTexts.size > 0 ||
            (extractionStatus && extractionStatus.size > 0)) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span>
                업로드 자료 {extractionStatus?.size || availableTexts.size}개를
                참고합니다.
              </span>
              {extractionStatus &&
                Array.from(extractionStatus.entries()).map(([fileName, status]) => (
                  <span
                    key={fileName}
                    className={
                      status === "done"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : status === "failed"
                        ? "text-red-500"
                        : "text-blue-600 dark:text-blue-400"
                    }
                  >
                    {fileName}
                  </span>
                ))}
            </div>
          )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isDisabled && (
          <p className="text-xs text-muted-foreground">
            {isAssignmentMode
              ? "과제 제목과 리서치 주제를 입력해야 생성할 수 있습니다."
              : "시험 제목을 먼저 입력해야 생성할 수 있습니다."}
          </p>
        )}

        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{displayStageMessage}</span>
              {isMultiQuestion && <span>{Math.round(progressPercent)}%</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              {isMultiQuestion ? (
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              ) : (
                <motion.div
                  className="h-full w-2/5 rounded-full bg-primary/70"
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

        {(generatedQuestions.length > 0 || skeletonCount > 0) && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              생성 완료 시 문제 목록에 자동 추가됩니다.
            </p>
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
                    generationMode={
                      isAssignmentMode ? "research-assignment" : "case"
                    }
                    onRegenerate={() => regenerateOne(q.id, getGenerateParams())}
                    onRemove={() => removeQuestion(q.id)}
                    onAdjust={async (instruction) => {
                      return await adjustQuestion(
                        q.id,
                        instruction,
                        examTitle,
                        language,
                        isAssignmentMode ? "research-assignment" : "case",
                      );
                    }}
                    onApplyAdjustment={(newText) =>
                      applyAdjustment(q.id, newText)
                    }
                    isAnyAdjusting={adjustingId !== null}
                  />
                </motion.div>
              ))}
              {Array.from({ length: skeletonCount }, (_, i) => (
                <motion.div
                  key={`skeleton-${generationProgress.current + i}`}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  layout
                >
                  <QuestionSkeletonCard index={generationProgress.current + i} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-xl">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {isAssignmentMode ? "AI 리서치 과제 생성" : "AI 사례형 문제 생성"}
              {generatedQuestions.length > 0 && (
                <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {generatedQuestions.length}개 생성됨
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
          <CardContent className="space-y-4">
            {/* Question count */}
            <div className="space-y-1.5">
              <Label className="text-sm">생성할 문제 수</Label>
              <Select
                value={questionCount.toString()}
                onValueChange={(v) => setQuestionCount(Number(v))}
              >
                <SelectTrigger ref={countElementRef} className="w-32">
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

            {/* Freeform prompt */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                {isAssignmentMode ? "학생에게 어떤 리서치를 시킬까요?" : "어떤 문제를 만들어드릴까요?"}
                {!isAssignmentMode && (
                  <span className="text-muted-foreground font-normal ml-1">
                    (선택)
                  </span>
                )}
              </Label>
              <Textarea
                ref={freeformElementRef}
                value={freeformPrompt}
                onChange={(e) => setFreeformPrompt(e.target.value)}
                placeholder={
                  isAssignmentMode
                    ? "예: 국내 배달앱 3사의 최근 수익성 변화를 조사해오시오"
                    : "예: 시장조사 과제, 한국 기업 사례 중심, 난이도 높게..."
                }
                maxLength={2000}
                className="min-h-[80px] resize-none"
              />
            </div>

            {/* Materials info - P2-2: Show file details */}
            {!isAssignmentMode && (availableTexts.size > 0 ||
              (extractionStatus && extractionStatus.size > 0)) && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    업로드된 자료{" "}
                    {extractionStatus?.size || availableTexts.size}개가 문제
                    생성에 활용됩니다.
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-1 pl-5">
                    {extractionStatus
                      ? Array.from(extractionStatus.entries()).map(
                          ([fileName, status]) => (
                            <div
                              key={fileName}
                              className="flex items-center gap-1.5 text-xs"
                            >
                              {status === "done" ? (
                                <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                              ) : status === "failed" ? (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              ) : (
                                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              )}
                              <span
                                className={
                                  status === "failed"
                                    ? "text-red-500 line-through"
                                    : "text-muted-foreground"
                                }
                              >
                                {fileName}
                              </span>
                              {status === "failed" && (
                                <span className="text-red-500">
                                  (추출 실패)
                                </span>
                              )}
                            </div>
                          ),
                        )
                      : Array.from(availableTexts.values()).map(
                          ({ fileName }) => (
                            <div
                              key={fileName}
                              className="flex items-center gap-1.5 text-xs"
                            >
                              <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                              <span className="text-muted-foreground">
                                {fileName}
                              </span>
                            </div>
                          ),
                        )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Error */}
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Generate / Cancel buttons */}
            <div className="flex items-center gap-2">
              <Button
                ref={generateButtonRef}
                type="button"
                onClick={handleGenerate}
                disabled={isDisabled || isGenerating}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isAssignmentMode ? "리서치 과제 생성하기" : "문제 생성하기"}
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
                {isAssignmentMode
                  ? "과제 제목과 리서치 주제를 입력해야 과제를 생성할 수 있습니다."
                  : "시험 제목을 먼저 입력해야 문제를 생성할 수 있습니다."}
              </p>
            )}

            {/* Progress indicator during generation */}
            {isGenerating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{displayStageMessage}</span>
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
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      AI 생성 미리보기
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      생성 완료 시 자동으로 문제 목록에 추가됩니다.
                    </p>
                  </div>
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
                        generationMode={isAssignmentMode ? "research-assignment" : "case"}
                        onRegenerate={() =>
                          regenerateOne(q.id, getGenerateParams())
                        }
                        onRemove={() => removeQuestion(q.id)}
                        onAdjust={async (instruction) => {
                          return await adjustQuestion(
                            q.id,
                            instruction,
                            examTitle,
                            language,
                            isAssignmentMode ? "research-assignment" : "case",
                          );
                        }}
                        onApplyAdjustment={(newText) =>
                          applyAdjustment(q.id, newText)
                        }
                        isAnyAdjusting={adjustingId !== null}
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
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
