"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

interface UseAutoSaveOptions {
  sessionId: string | null;
  examExists: boolean;
  intervalMs?: number;
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
}: UseAutoSaveOptions) {
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswer[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const consecutiveFailures = useRef(0);
  const wasOfflineRef = useRef(false);

  const saveDrafts = useCallback(
    async (answers: DraftAnswer[]) => {
      if (!sessionId || !examExists) return;

      setIsSaving(true);
      try {
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_draft_answers",
            data: {
              sessionId,
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
          consecutiveFailures.current++;
          if (consecutiveFailures.current >= 3) {
            setSaveError(true);
          }
        }
      } catch {
        consecutiveFailures.current++;
        if (consecutiveFailures.current >= 3) {
          setSaveError(true);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId, examExists]
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
        // Immediate save on reconnect
        saveDrafts(draftAnswers);
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
  }, [saveDrafts, draftAnswers]);

  // Keyboard shortcut (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        saveDrafts(draftAnswers);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saveDrafts, draftAnswers]);

  // Auto-save interval with jitter to spread requests across 50 students
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      timeout = setTimeout(() => {
        if (
          draftAnswers.some(
            (answer) => answer.text && !isHtmlEmpty(answer.text)
          )
        ) {
          saveDrafts(draftAnswers);
        }
        scheduleNext();
      }, jitter(intervalMs));
    }

    scheduleNext();

    return () => clearTimeout(timeout);
  }, [saveDrafts, draftAnswers, intervalMs]);

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

  // Keep a ref to latest draftAnswers for beforeunload access
  const draftAnswersRef = useRef(draftAnswers);
  draftAnswersRef.current = draftAnswers;

  // Save via sendBeacon (for beforeunload)
  const saveViaBeacon = useCallback(() => {
    if (!sessionId || !examExists) return;
    const answers = draftAnswersRef.current;
    if (!answers.some((a) => a.text && !isHtmlEmpty(a.text))) return;

    const payload = JSON.stringify({
      action: "save_draft_answers",
      data: {
        sessionId,
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
  }, [sessionId, examExists]);

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
