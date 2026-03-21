"use client";

import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  hasCanvasUpdate?: boolean;
  canvasContent?: string;
}

interface UseAssignmentChatOptions {
  sessionId: string;
  examId: string;
  studentId: string;
  onCanvasUpdate?: (content: string) => void;
  onCanvasOpen?: () => void;
}

export function useAssignmentChat({
  sessionId,
  examId,
  studentId,
  onCanvasUpdate,
  onCanvasOpen,
}: UseAssignmentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousResponseIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: message,
      };

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/api/assignment-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId,
            examId,
            studentId,
            previousResponseId: previousResponseIdRef.current,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Chat request failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEventType = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7);
              continue;
            }

            if (line === "") {
              currentEventType = "";
              continue;
            }

            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (currentEventType === "chat_token" && data.token) {
                  fullContent += data.token;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: fullContent }
                        : m
                    )
                  );
                } else if (currentEventType === "canvas_update" && data.content) {
                  onCanvasUpdate?.(data.content);
                  onCanvasOpen?.();
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, hasCanvasUpdate: true, canvasContent: data.content }
                        : m
                    )
                  );
                } else if (currentEventType === "done") {
                  if (data.responseId) {
                    previousResponseIdRef.current = data.responseId;
                  }
                }
              } catch {
                // ignore parse errors for partial data
              }
            }
          }
        }

        // Finalize streaming message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: fullContent, isStreaming: false }
              : m
          )
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, examId, studentId, isLoading, onCanvasUpdate, onCanvasOpen]
  );

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    cancelStream,
  };
}
