"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { Question } from "@/components/instructor/QuestionEditor";
import type { RubricItem } from "@/components/instructor/RubricTable";
import type { ChatMessage } from "@/hooks/useQuestionGeneration";

const STORAGE_KEY = "quest-on:exam-draft";
const SAVE_INTERVAL_MS = 5000;

export interface ExamDraftData {
  title: string;
  duration: number;
  code: string;
  questions: Question[];
  rubric: RubricItem[];
  isRubricPublic: boolean;
  chatWeight: number | null;
  adjustHistory: Record<string, ChatMessage[]>;
  savedAt: string;
}

interface UseExamDraftAutoSaveOptions {
  title: string;
  duration: number;
  code: string;
  questions: Question[];
  rubric: RubricItem[];
  isRubricPublic: boolean;
  chatWeight: number | null;
  adjustHistoryRef: React.RefObject<Map<string, ChatMessage[]>>;
}

function loadDraft(): ExamDraftData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: ExamDraftData = JSON.parse(raw);
    const hasMeaningfulData =
      parsed.title?.trim() ||
      (parsed.questions?.length > 0 &&
        parsed.questions.some((q) => q.text?.trim()));
    if (hasMeaningfulData) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function useExamDraftAutoSave(options: UseExamDraftAutoSaveOptions) {
  // Lazy init: read localStorage once on mount
  const [savedDraft] = useState<ExamDraftData | null>(() => loadDraft());
  const [showRestoreModal, setShowRestoreModal] = useState(
    () => loadDraft() !== null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Save to localStorage
  const saveDraft = useCallback(() => {
    const opts = optionsRef.current;
    const hasMeaningfulData =
      opts.title.trim() ||
      (opts.questions.length > 0 && opts.questions.some((q) => q.text.trim()));
    if (!hasMeaningfulData) return;

    const draft: ExamDraftData = {
      title: opts.title,
      duration: opts.duration,
      code: opts.code,
      questions: opts.questions,
      rubric: opts.rubric,
      isRubricPublic: opts.isRubricPublic,
      chatWeight: opts.chatWeight,
      adjustHistory: Object.fromEntries(opts.adjustHistoryRef.current ?? new Map()),
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage full or unavailable
    }
  }, []);

  // Auto-save interval
  useEffect(() => {
    timerRef.current = setInterval(saveDraft, SAVE_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [saveDraft]);

  // Save on beforeunload
  useEffect(() => {
    const handler = () => saveDraft();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveDraft]);

  const restoreDraft = useCallback(() => {
    setShowRestoreModal(false);
    return savedDraft;
  }, [savedDraft]);

  const discardDraft = useCallback(() => {
    setShowRestoreModal(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    showRestoreModal,
    savedDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
