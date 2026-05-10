"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 2_500;

interface UseFinalAnswerParams {
  sessionId: string | undefined;
  examId: string | undefined;
  studentId: string | undefined;
  initialValue: string | null | undefined;
  /** 제출/locked 상태에서는 저장을 시도하지 않는다. */
  disabled?: boolean;
}

interface UseFinalAnswerResult {
  value: string;
  setValue: (next: string) => void;
  /** 디바운스 큐를 즉시 비우고 마지막 저장 응답을 기다린다. */
  flush: () => Promise<{ ok: boolean; error?: string }>;
  isSaving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  /** 마지막으로 서버에 저장된 값 (UI에서 dirty 표시용) */
  savedValue: string;
}

/**
 * 과제 최종답안 자동저장 훅.
 * - 입력 후 2.5초 디바운스
 * - 페이지 이탈 시 sendBeacon 백업
 * - flush() 시 in-flight 요청 abort + 새 요청 (out-of-order 응답 무시는 sequence number로)
 */
export function useFinalAnswer({
  sessionId,
  examId,
  studentId,
  initialValue,
  disabled = false,
}: UseFinalAnswerParams): UseFinalAnswerResult {
  const initial = initialValue ?? "";
  const [value, setValueState] = useState<string>(initial);
  const [savedValue, setSavedValue] = useState<string>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const valueRef = useRef<string>(initial);
  const disabledRef = useRef<boolean>(disabled);
  const initialHydratedRef = useRef<boolean>(false);

  // Hydrate when initialValue arrives later (e.g., async session load)
  useEffect(() => {
    if (initialHydratedRef.current) return;
    if (initialValue == null) return;
    setValueState(initialValue);
    setSavedValue(initialValue);
    valueRef.current = initialValue;
    initialHydratedRef.current = true;
  }, [initialValue]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const performSave = useCallback(
    async (toSave: string): Promise<{ ok: boolean; error?: string }> => {
      if (!sessionId || !examId || !studentId) {
        return { ok: false, error: "session not ready" };
      }
      if (disabledRef.current) {
        return { ok: false, error: "disabled" };
      }

      // Cancel any in-flight save — we're about to supersede it
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const seq = ++seqRef.current;
      setIsSaving(true);
      setError(null);

      try {
        const res = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_final_answer",
            data: {
              sessionId,
              examId,
              studentId,
              finalAnswer: toSave,
            },
          }),
          signal: controller.signal,
        });

        // Discard out-of-order responses
        if (seq < lastAppliedSeqRef.current) {
          return { ok: true };
        }
        lastAppliedSeqRef.current = seq;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = data?.message || "저장에 실패했습니다.";
          setError(msg);
          return { ok: false, error: msg };
        }

        setSavedValue(toSave);
        setLastSavedAt(Date.now());
        return { ok: true };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // superseded — don't surface as user error
          return { ok: false, error: "aborted" };
        }
        const msg = e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        // Only the latest sequence clears the saving spinner
        if (seq >= lastAppliedSeqRef.current) {
          setIsSaving(false);
        }
      }
    },
    [sessionId, examId, studentId]
  );

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      valueRef.current = next;

      if (disabledRef.current) return;
      if (!sessionId || !examId || !studentId) return;

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        void performSave(valueRef.current);
      }, DEBOUNCE_MS);
    },
    [sessionId, examId, studentId, performSave]
  );

  const flush = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    // No pending changes? skip network call.
    if (valueRef.current === savedValue) {
      return { ok: true };
    }
    return performSave(valueRef.current);
  }, [performSave, savedValue]);

  // beforeunload backup via sendBeacon (best-effort)
  useEffect(() => {
    function handleBeforeUnload() {
      if (disabledRef.current) return;
      if (!sessionId || !examId || !studentId) return;
      if (valueRef.current === savedValue) return;

      try {
        const payload = JSON.stringify({
          action: "save_final_answer",
          data: {
            sessionId,
            examId,
            studentId,
            finalAnswer: valueRef.current,
          },
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon?.("/api/supa", blob);
      } catch {
        // best effort
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionId, examId, studentId, savedValue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  return {
    value,
    setValue,
    flush,
    isSaving,
    lastSavedAt,
    error,
    savedValue,
  };
}
