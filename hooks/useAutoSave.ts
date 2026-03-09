"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";

export interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface UseAutoSaveOptions {
  sessionId: string | null;
  examExists: boolean;
  intervalMs?: number;
  localStorageKey?: string;
}

function isHtmlEmpty(html: string): boolean {
  if (!html) return true;
  const textContent = html.replace(/<[^>]*>/g, "").trim();
  return textContent.length === 0;
}

/** Random jitter ±5 seconds to spread requests across students */
function jitter(baseMs: number): number {
  const jitterMs = (Math.random() - 0.5) * 10_000; // -5s to +5s
  return Math.max(10_000, baseMs + jitterMs); // floor at 10s
}

export function useAutoSave({
  sessionId,
  examExists,
  intervalMs = 30000,
  localStorageKey,
}: UseAutoSaveOptions) {
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswer[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const consecutiveFailures = useRef(0);
  const wasOfflineRef = useRef(false);
  const savingRef = useRef(false);
  const pendingAnswersRef = useRef<DraftAnswer[] | null>(null);

  const prevSaveErrorRef = useRef(false);

  // Keep refs to avoid stale closures in event handlers and callbacks
  const draftAnswersRef = useRef(draftAnswers);
  draftAnswersRef.current = draftAnswers;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Fix 1A: Toast notification when saveError changes
  useEffect(() => {
    if (saveError && !prevSaveErrorRef.current) {
      toast.error("답안 저장에 실패했습니다. 인터넷 연결을 확인해주세요.", {
        id: "auto-save-failure",
        duration: 8000,
      });
    } else if (!saveError && prevSaveErrorRef.current) {
      toast.success("답안 저장이 복구되었습니다.", {
        id: "auto-save-failure",
        duration: 3000,
      });
    }
    prevSaveErrorRef.current = saveError;
  }, [saveError]);

  // Fix 1B: localStorage backup on draftAnswers change
  useEffect(() => {
    if (!localStorageKey || draftAnswers.length === 0) return;
    try {
      localStorage.setItem(
        localStorageKey,
        JSON.stringify({
          answers: draftAnswers,
          timestamp: new Date().toISOString(),
        })
      );
    } catch {
      // localStorage write failure (e.g. quota exceeded) is non-critical
    }
  }, [draftAnswers, localStorageKey]);

  const saveDrafts = useCallback(
    async (answers: DraftAnswer[]) => {
      const currentSessionId = sessionIdRef.current;
      if (!currentSessionId || !examExists) return;
      // If a save is in progress, queue the latest answers instead of dropping
      if (savingRef.current) {
        pendingAnswersRef.current = answers;
        return;
      }

      savingRef.current = true;
      setIsSaving(true);
      try {
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft_answers",
            data: {
              sessionId: currentSessionId,
              answers: answers.map((answer) => ({
                questionId: answer.questionId,
                text: answer.text?.replace(/\u0000/g, "") || "",
              })),
            },
          }),
        });

        if (response.ok) {
          setLastSaved(new Date().toLocaleTimeString());
          consecutiveFailures.current = 0;
          setSaveError(false);
        } else {
          // P1-6: Immediate retry once after 5s on failure
          await new Promise((r) => setTimeout(r, 5_000));
          const retryResponse = await fetch("/api/supa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_draft_answers",
              data: {
                sessionId: currentSessionId,
                answers: answers.map((answer) => ({
                  questionId: answer.questionId,
                  text: answer.text?.replace(/\u0000/g, "") || "",
                })),
              },
            }),
          });
          if (retryResponse.ok) {
            setLastSaved(new Date().toLocaleTimeString());
            consecutiveFailures.current = 0;
            setSaveError(false);
          } else {
            consecutiveFailures.current++;
            if (consecutiveFailures.current >= 3) {
              setSaveError(true);
            }
          }
        }
      } catch {
        // P1-6: Immediate retry once after 5s on network failure
        try {
          await new Promise((r) => setTimeout(r, 5_000));
          const retryResponse = await fetch("/api/supa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_draft_answers",
              data: {
                sessionId: currentSessionId,
                answers: answers.map((answer) => ({
                  questionId: answer.questionId,
                  text: answer.text?.replace(/\u0000/g, "") || "",
                })),
              },
            }),
          });
          if (retryResponse.ok) {
            setLastSaved(new Date().toLocaleTimeString());
            consecutiveFailures.current = 0;
            setSaveError(false);
            return;
          }
        } catch {
          // Retry also failed
        }
        consecutiveFailures.current++;
        if (consecutiveFailures.current >= 3) {
          setSaveError(true);
        }
      } finally {
        savingRef.current = false;
        setIsSaving(false);
        // Drain queued save if any (always keep only the latest)
        const pending = pendingAnswersRef.current;
        if (pending) {
          pendingAnswersRef.current = null;
          saveDrafts(pending);
        }
      }
    },
    [examExists]
  );

  // Manual save (wraps current draftAnswers)
  const manualSave = useCallback(async () => {
    await saveDrafts(draftAnswers);
  }, [saveDrafts, draftAnswers]);

  // Network status detection — trigger immediate save on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        // P1-8: Guard against thundering herd — skip if already saving
        if (!savingRef.current) {
          saveDrafts(draftAnswersRef.current);
        }
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
    };

    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [saveDrafts]);

  // Keyboard shortcut (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        // P1-7: Skip if already saving (debounce rapid Cmd+S)
        if (savingRef.current) return;
        saveDrafts(draftAnswersRef.current);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saveDrafts]);

  // Auto-save interval with jitter to spread requests across 50 students
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      timeout = setTimeout(() => {
        const current = draftAnswersRef.current;
        if (
          current.some(
            (answer) => answer.text && !isHtmlEmpty(answer.text)
          )
        ) {
          saveDrafts(current);
        }
        scheduleNext();
      }, jitter(intervalMs));
    }

    scheduleNext();

    return () => clearTimeout(timeout);
  }, [saveDrafts, intervalMs]);

  const updateAnswer = useCallback(
    (questionId: string, text: string) => {
      setDraftAnswers((prev) =>
        prev.map((answer) =>
          answer.questionId === questionId ? { ...answer, text } : answer
        )
      );
    },
    []
  );

  // Save via sendBeacon (for beforeunload)
  const saveViaBeacon = useCallback(() => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || !examExists) return;
    const answers = draftAnswersRef.current;
    if (!answers.some((a) => a.text && !isHtmlEmpty(a.text))) return;

    const payload = JSON.stringify({
      action: "save_draft_answers",
      data: {
        sessionId: currentSessionId,
        answers: answers.map((a) => ({
          questionId: a.questionId,
          text: a.text?.replace(/\u0000/g, "") || "",
        })),
      },
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/supa",
        new Blob([payload], { type: "application/json" })
      );
    } else {
      fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [examExists]);

  return {
    draftAnswers,
    setDraftAnswers,
    lastSaved,
    isSaving,
    saveError,
    isOnline,
    manualSave,
    updateAnswer,
    saveViaBeacon,
  };
}
