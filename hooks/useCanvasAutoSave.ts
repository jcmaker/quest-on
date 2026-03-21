"use client";

import { useRef, useEffect, useCallback } from "react";

interface UseCanvasAutoSaveOptions {
  sessionId: string;
  content: string;
  intervalMs?: number;
  enabled?: boolean;
}

export function useCanvasAutoSave({
  sessionId,
  content,
  intervalMs = 30000,
  enabled = true,
}: UseCanvasAutoSaveOptions) {
  const lastSavedRef = useRef<string>("");
  const isSavingRef = useRef(false);

  const saveCanvas = useCallback(async (contentToSave: string) => {
    if (!sessionId || !contentToSave || isSavingRef.current) return;
    if (contentToSave === lastSavedRef.current) return;

    isSavingRef.current = true;
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_canvas",
          data: { sessionId, content: contentToSave },
        }),
      });

      if (response.ok) {
        lastSavedRef.current = contentToSave;
      }
    } catch {
      // Silent failure for auto-save
    } finally {
      isSavingRef.current = false;
    }
  }, [sessionId]);

  // Auto-save on interval
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const interval = setInterval(() => {
      if (content && content !== lastSavedRef.current) {
        saveCanvas(content);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, sessionId, content, intervalMs, saveCanvas]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (content && content !== lastSavedRef.current) {
        // Fire and forget on unmount
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_canvas",
            data: { sessionId, content },
          }),
        }).catch(() => {});
      }
    };
  }, [sessionId, content]);

  return { saveCanvas, lastSaved: lastSavedRef.current };
}
