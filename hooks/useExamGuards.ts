"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface Exam {
  questions: Array<{ id: string; text: string; ai_context?: string }>;
}

interface UseExamGuardsOptions {
  sessionId: string | null;
  exam: Exam | null;
  isSubmitted: boolean;
  draftAnswers: DraftAnswer[];
  user: { id: string } | null | undefined;
  examCode: string;
  currentQuestion: number;
  isOnline: boolean;
  setCurrentQuestion: (idx: number) => void;
  setShowExitConfirm: (show: boolean) => void;
}

export function useExamGuards({
  sessionId,
  exam,
  isSubmitted,
  draftAnswers,
  user,
  examCode,
  currentQuestion,
  isOnline,
  setCurrentQuestion,
  setShowExitConfirm,
}: UseExamGuardsOptions) {
  // Warn user about unsaved answers when closing/refreshing tab during exam
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    const handleUnsavedWarning = (e: BeforeUnloadEvent) => {
      const hasContent = draftAnswers.some(
        (a) => a.text && a.text.replace(/<[^>]*>/g, "").trim().length > 0
      );
      if (hasContent) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleUnsavedWarning);
    return () =>
      window.removeEventListener("beforeunload", handleUnsavedWarning);
  }, [sessionId, exam, isSubmitted, draftAnswers]);

  // Block browser back button during exam (SPA nav guard)
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      setShowExitConfirm(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sessionId, exam, isSubmitted, setShowExitConfirm]);

  // Detect tab switches (visibilitychange) for anti-cheat monitoring
  useEffect(() => {
    if (!sessionId || !user || isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: 0,
            pasted_text: "[TAB_SWITCH]",
            paste_start: 0,
            paste_end: 0,
            answer_length_before: 0,
            isInternal: false,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId,
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionId, user, isSubmitted, examCode, exam, currentQuestion]);

  // Show toast on network reconnect
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.success("네트워크 연결이 복원되었습니다. 답안을 저장하는 중...", {
        duration: 3000,
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  // Keyboard shortcuts: Alt+1~9 for question navigation
  useEffect(() => {
    if (!exam || isSubmitted) return;

    const handleQuestionShortcut = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= Math.min(9, exam.questions.length)) {
        e.preventDefault();
        setCurrentQuestion(num - 1);
      }
    };

    document.addEventListener("keydown", handleQuestionShortcut);
    return () => document.removeEventListener("keydown", handleQuestionShortcut);
  }, [exam, isSubmitted, setCurrentQuestion]);
}
