"use client";

import { useState, useCallback } from "react";
import type { GeneratedQuestion } from "./useQuestionGeneration";

// ── Types ────────────────────────────────────────────────────────────────────

/** 모달에서 관리하는 슬롯 단위 (유형 + 생성 수 + 프롬프트) */
export type BulkSlot = {
  /** 클라이언트 식별용 임시 ID */
  tempId: string;
  type: "mcq" | "true-false" | "case";
  /** 유형별 추가 지시사항 */
  prompt: string;
  /** 생성할 문제 수 */
  count: number;
};

/** 유형별 상태 */
export type GroupStatus = "idle" | "loading" | "success" | "error";

export type GroupResult = {
  type: BulkSlot["type"];
  status: GroupStatus;
  /** 성공 시 생성된 문제들 */
  questions: GeneratedQuestion[];
  error?: string;
};

/** generateAll 호출 시 함께 넘기는 시험 메타 정보 */
export type BulkGenerateMeta = {
  examTitle: string;
  language?: "ko" | "en";
  /** 강의 자료 텍스트 목록 */
  materialsText?: Array<{ url: string; text: string; fileName: string }>;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBulkQuestionGeneration() {
  const [groupResults, setGroupResults] = useState<
    Record<string, GroupResult>
  >({});

  /** 단일 유형 그룹에 대한 API 호출 */
  const callGenerate = useCallback(
    async (
      type: BulkSlot["type"],
      count: number,
      prompt: string,
      meta: BulkGenerateMeta
    ): Promise<GeneratedQuestion[]> => {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionType: type,
          questionCount: count,
          customInstructions: prompt || undefined,
          examTitle: meta.examTitle,
          language: meta.language,
          materialsText: meta.materialsText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message ?? "문제 생성에 실패했습니다.");
      }

      const data = await res.json() as { questions?: GeneratedQuestion[] };
      return data.questions ?? [];
    },
    []
  );

  /**
   * 슬롯 목록을 받아 유형별로 그룹화한 뒤 병렬 호출.
   * 동일 type이면 count 합산, prompt는 줄바꿈으로 합산.
   */
  const generateAll = useCallback(
    async (slots: BulkSlot[], meta: BulkGenerateMeta): Promise<void> => {
      if (slots.length === 0) return;

      // 유형별 그룹화
      type Grouped = { count: number; prompts: string[] };
      const grouped: Record<string, Grouped> = {};
      for (const slot of slots) {
        if (!grouped[slot.type]) {
          grouped[slot.type] = { count: 0, prompts: [] };
        }
        grouped[slot.type].count += slot.count;
        if (slot.prompt.trim()) {
          grouped[slot.type].prompts.push(slot.prompt.trim());
        }
      }

      const types = Object.keys(grouped) as BulkSlot["type"][];

      // 로딩 상태 초기화
      setGroupResults(
        Object.fromEntries(
          types.map((type) => [
            type,
            { type, status: "loading" as GroupStatus, questions: [] },
          ])
        )
      );

      // 병렬 호출
      await Promise.allSettled(
        types.map(async (type) => {
          const { count, prompts } = grouped[type];
          const prompt = prompts.join("\n");
          try {
            const questions = await callGenerate(type, count, prompt, meta);
            setGroupResults((prev) => ({
              ...prev,
              [type]: { type, status: "success", questions },
            }));
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
            setGroupResults((prev) => ({
              ...prev,
              [type]: { type, status: "error", questions: [], error: errorMsg },
            }));
          }
        })
      );
    },
    [callGenerate]
  );

  /**
   * 특정 유형 그룹만 재시도.
   * 현재 groupResults에 저장된 기존 meta/count 정보가 없으므로
   * 호출자가 slots 와 meta 를 다시 넘겨야 한다.
   */
  const retryGroup = useCallback(
    async (
      type: BulkSlot["type"],
      slots: BulkSlot[],
      meta: BulkGenerateMeta
    ): Promise<void> => {
      const typeSlots = slots.filter((s) => s.type === type);
      if (typeSlots.length === 0) return;

      const count = typeSlots.reduce((sum, s) => sum + s.count, 0);
      const prompt = typeSlots
        .map((s) => s.prompt.trim())
        .filter(Boolean)
        .join("\n");

      setGroupResults((prev) => ({
        ...prev,
        [type]: { type, status: "loading", questions: [] },
      }));

      try {
        const questions = await callGenerate(type, count, prompt, meta);
        setGroupResults((prev) => ({
          ...prev,
          [type]: { type, status: "success", questions },
        }));
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "문제 생성 중 오류가 발생했습니다.";
        setGroupResults((prev) => ({
          ...prev,
          [type]: { type, status: "error", questions: [], error: errorMsg },
        }));
      }
    },
    [callGenerate]
  );

  /** 하나라도 loading 중이면 true */
  const isLoading = Object.values(groupResults).some(
    (r) => r.status === "loading"
  );

  /** 모든 그룹이 success 또는 error 이면 true (idle 없고 loading 없을 때) */
  const allDone =
    Object.keys(groupResults).length > 0 &&
    Object.values(groupResults).every(
      (r) => r.status === "success" || r.status === "error"
    );

  /** success 그룹의 문제들만 flatten */
  const successQuestions: GeneratedQuestion[] = Object.values(groupResults)
    .filter((r) => r.status === "success")
    .flatMap((r) => r.questions);

  /** 상태 초기화 */
  const reset = useCallback(() => {
    setGroupResults({});
  }, []);

  return {
    groupResults,
    generateAll,
    retryGroup,
    isLoading,
    allDone,
    successQuestions,
    reset,
  };
}
