"use client";

import { useState, useCallback, useRef } from "react";

export interface GeneratedQuestion {
  id: string;
  text: string;
  type: "essay";
}

export interface RubricItem {
  evaluationArea: string;
  detailedCriteria: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  questionText?: string; // AI가 제안한 수정본
  explanation?: string; // 변경 사항 요약
}

export interface GenerationProgress {
  stage: "idle" | "started" | "generating" | "complete";
  current: number;
  total: number;
}

interface GenerateParams {
  examTitle: string;
  difficulty: "basic" | "intermediate" | "advanced";
  questionCount: number;
  topics?: string;
  customInstructions?: string;
  materialsText?: Array<{ url: string; text: string; fileName: string }>;
}

interface AdjustResult {
  questionText: string;
  explanation: string;
}

export interface UseQuestionGenerationReturn {
  generatedQuestions: GeneratedQuestion[];
  suggestedRubric: RubricItem[];
  isGenerating: boolean;
  isAdjusting: boolean;
  error: string | null;
  generationProgress: GenerationProgress;

  generate(params: GenerateParams): Promise<void>;
  generateStream(params: GenerateParams): Promise<void>;
  cancelGeneration(): void;
  regenerateOne(
    questionId: string,
    params: GenerateParams
  ): Promise<void>;
  removeQuestion(questionId: string): void;

  adjustQuestion(
    questionId: string,
    instruction: string,
    examTitle?: string
  ): Promise<AdjustResult | null>;
  applyAdjustment(questionId: string, newText: string): void;
  getAdjustHistory(questionId: string): ChatMessage[];

  acceptQuestion(questionId: string): GeneratedQuestion | null;
  acceptAll(): GeneratedQuestion[];
  clearAll(): void;
}

export function useQuestionGeneration(): UseQuestionGenerationReturn {
  const [generatedQuestions, setGeneratedQuestions] = useState<
    GeneratedQuestion[]
  >([]);
  const [suggestedRubric, setSuggestedRubric] = useState<RubricItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress>({
      stage: "idle",
      current: 0,
      total: 0,
    });

  // Per-question conversation history
  const adjustHistoryRef = useRef<Map<string, ChatMessage[]>>(new Map());
  // AbortController for stream cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Existing non-streaming generate ──
  const generate = useCallback(async (params: GenerateParams) => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "문제 생성에 실패했습니다.");
      }

      const data = await res.json();
      setGeneratedQuestions((prev) => [...prev, ...data.questions]);
      if (data.suggestedRubric?.length > 0) {
        setSuggestedRubric(data.suggestedRubric);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // ── New SSE streaming generate ──
  const generateStream = useCallback(async (params: GenerateParams) => {
    setIsGenerating(true);
    setError(null);
    setGenerationProgress({ stage: "started", current: 0, total: params.questionCount });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Track partial failures within the stream
    let partialFailures = 0;
    let totalRequested = params.questionCount;

    try {
      const res = await fetch("/api/ai/generate-questions-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "문제 생성에 실패했습니다.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case "progress":
                  setGenerationProgress({
                    stage: data.stage,
                    current: data.current,
                    total: data.total,
                  });
                  break;

                case "question":
                  setGeneratedQuestions((prev) => [...prev, data.question]);
                  break;

                case "rubric":
                  if (data.suggestedRubric?.length > 0) {
                    setSuggestedRubric(data.suggestedRubric);
                  }
                  break;

                case "complete":
                  totalRequested = data.totalQuestions;
                  partialFailures = data.totalQuestions - (data.successCount ?? data.totalQuestions);
                  setGenerationProgress({
                    stage: "complete",
                    current: data.totalQuestions,
                    total: data.totalQuestions,
                  });
                  break;

                case "error":
                  if (!data.partial) {
                    throw new Error(data.message);
                  }
                  break;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
                throw parseErr;
              }
            }
            currentEvent = "";
          } else if (line === "") {
            currentEvent = "";
          }
        }
      }

      // After stream ends: surface partial failures
      if (partialFailures > 0) {
        const succeeded = totalRequested - partialFailures;
        if (succeeded === 0) {
          setError("문제 생성에 실패했습니다. 다시 시도해주세요.");
        } else {
          setError(`${totalRequested}개 중 ${partialFailures}개 문제 생성에 실패했습니다.`);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      const msg =
        err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
    setGenerationProgress((prev) => ({ ...prev, stage: "complete" }));
  }, []);

  const regenerateOne = useCallback(
    async (questionId: string, params: GenerateParams) => {
      setIsGenerating(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...params,
            questionCount: 1,
            customInstructions: [
              params.customInstructions,
              "이전 문제와 다른 시나리오와 관점으로 생성해주세요.",
            ]
              .filter(Boolean)
              .join(" "),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "문제 재생성에 실패했습니다.");
        }

        const data = await res.json();
        if (data.questions?.[0]) {
          setGeneratedQuestions((prev) =>
            prev.map((q) => (q.id === questionId ? data.questions[0] : q))
          );
          // Clear adjust history for regenerated question
          adjustHistoryRef.current.delete(questionId);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "문제 재생성 중 오류가 발생했습니다.";
        setError(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const removeQuestion = useCallback((questionId: string) => {
    setGeneratedQuestions((prev) => prev.filter((q) => q.id !== questionId));
    adjustHistoryRef.current.delete(questionId);
  }, []);

  const adjustQuestion = useCallback(
    async (
      questionId: string,
      instruction: string,
      examTitle?: string
    ): Promise<AdjustResult | null> => {
      setIsAdjusting(true);
      setError(null);

      try {
        const question = generatedQuestions.find((q) => q.id === questionId);
        if (!question) throw new Error("문제를 찾을 수 없습니다.");

        const history = adjustHistoryRef.current.get(questionId) || [];

        // Add user message to history
        const userMessage: ChatMessage = { role: "user", content: instruction };
        const updatedHistory = [...history, userMessage];

        const res = await fetch("/api/ai/adjust-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: question.text,
            instruction,
            conversationHistory: updatedHistory
              .filter((m) => !m.questionText)
              .map((m) => ({ role: m.role, content: m.content })),
            examTitle,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "문제 수정에 실패했습니다.");
        }

        const data = await res.json();
        const result: AdjustResult = {
          questionText: data.questionText,
          explanation: data.explanation,
        };

        // Add AI response to history
        const aiMessage: ChatMessage = {
          role: "assistant",
          content: result.explanation,
          questionText: result.questionText,
          explanation: result.explanation,
        };

        adjustHistoryRef.current.set(questionId, [
          ...updatedHistory,
          aiMessage,
        ]);

        return result;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "문제 수정 중 오류가 발생했습니다.";
        setError(msg);
        return null;
      } finally {
        setIsAdjusting(false);
      }
    },
    [generatedQuestions]
  );

  const applyAdjustment = useCallback(
    (questionId: string, newText: string) => {
      setGeneratedQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, text: newText } : q))
      );
    },
    []
  );

  const getAdjustHistory = useCallback(
    (questionId: string): ChatMessage[] => {
      return adjustHistoryRef.current.get(questionId) || [];
    },
    []
  );

  const acceptQuestion = useCallback(
    (questionId: string): GeneratedQuestion | null => {
      const question = generatedQuestions.find((q) => q.id === questionId);
      if (!question) return null;

      setGeneratedQuestions((prev) =>
        prev.filter((q) => q.id !== questionId)
      );
      adjustHistoryRef.current.delete(questionId);
      return question;
    },
    [generatedQuestions]
  );

  const acceptAll = useCallback((): GeneratedQuestion[] => {
    const all = [...generatedQuestions];
    setGeneratedQuestions([]);
    adjustHistoryRef.current.clear();
    return all;
  }, [generatedQuestions]);

  const clearAll = useCallback(() => {
    setGeneratedQuestions([]);
    setSuggestedRubric([]);
    setError(null);
    setGenerationProgress({ stage: "idle", current: 0, total: 0 });
    adjustHistoryRef.current.clear();
  }, []);

  return {
    generatedQuestions,
    suggestedRubric,
    isGenerating,
    isAdjusting,
    error,
    generationProgress,
    generate,
    generateStream,
    cancelGeneration,
    regenerateOne,
    removeQuestion,
    adjustQuestion,
    applyAdjustment,
    getAdjustHistory,
    acceptQuestion,
    acceptAll,
    clearAll,
  };
}
