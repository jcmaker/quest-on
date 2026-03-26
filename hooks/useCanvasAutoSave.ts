"use client";

import { useRef, useEffect, useCallback } from "react";
import type { WorkspaceState } from "@/lib/types/workspace";

interface UseCanvasAutoSaveOptions {
  sessionId: string;
  content: string;
  intervalMs?: number;
  enabled?: boolean;
  workspaceState?: WorkspaceState;
}

export function useCanvasAutoSave({
  sessionId,
  content,
  intervalMs = 30000,
  enabled = true,
  workspaceState,
}: UseCanvasAutoSaveOptions) {
  const lastSavedRef = useRef<string>("");
  const lastWorkspaceRef = useRef<string>("");
  const isSavingRef = useRef(false);

  const saveCanvas = useCallback(async (contentToSave: string, ws?: WorkspaceState) => {
    if (!sessionId || isSavingRef.current) return;

    const wsJson = ws ? JSON.stringify(ws) : "";
    const contentUnchanged = contentToSave === lastSavedRef.current;
    const wsUnchanged = wsJson === lastWorkspaceRef.current;
    if (contentUnchanged && wsUnchanged) return;
    if (!contentToSave && !ws) return;

    isSavingRef.current = true;
    try {
      const saveData: Record<string, unknown> = {
        sessionId,
        content: contentToSave,
      };
      if (ws) {
        saveData.workspace_state = ws;
      }

      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_canvas",
          data: saveData,
        }),
      });

      if (response.ok) {
        lastSavedRef.current = contentToSave;
        if (wsJson) lastWorkspaceRef.current = wsJson;
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
      saveCanvas(content, workspaceState);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, sessionId, content, workspaceState, intervalMs, saveCanvas]);

  // Save on unmount
  useEffect(() => {
    return () => {
      const wsJson = workspaceState ? JSON.stringify(workspaceState) : "";
      const contentChanged = content !== lastSavedRef.current;
      const wsChanged = wsJson !== lastWorkspaceRef.current;

      if (contentChanged || wsChanged) {
        const saveData: Record<string, unknown> = {
          sessionId,
          content,
        };
        if (workspaceState) saveData.workspace_state = workspaceState;

        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_canvas",
            data: saveData,
          }),
        }).catch(() => {});
      }
    };
  }, [sessionId, content, workspaceState]);

  return { saveCanvas, lastSaved: lastSavedRef.current };
}
