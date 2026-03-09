import { useState, useCallback, useRef, useEffect } from "react";

interface ChatMessage {
  type: "user" | "assistant";
  message: string;
  timestamp: string;
  qIdx: number;
}

interface UseExamChatOptions {
  exam: { id?: string; title?: string; code?: string; questions?: Array<{ id: string; text: string; ai_context?: string }> } | null;
  userId?: string;
  sessionId: string | null;
  currentQuestion: number;
  scrollToBottom: () => void;
}

interface UseExamChatReturn {
  chatMessage: string;
  setChatMessage: (msg: string) => void;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isLoading: boolean;
  isTyping: boolean;
  sendChatMessage: () => Promise<void>;
  currentQuestionChatHistory: ChatMessage[];
}

// 스트리밍 SSE 응답을 소비하는 헬퍼
async function consumeStream(
  response: Response,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 이벤트 파싱: "data: ...\n\n" 형태
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || ""; // 마지막 불완전한 라인 보존

      for (const line of lines) {
        const dataLine = line.trim();
        if (!dataLine.startsWith("data: ")) continue;

        const raw = dataLine.slice(6); // "data: " 이후
        if (raw === "[DONE]") continue;

        try {
          const delta = JSON.parse(raw);
          if (typeof delta === "string") {
            if (delta === "[ERROR]") {
              throw new Error("Server streaming error");
            }
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // JSON 파싱 실패 — 무시
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

// 비스트리밍 폴백: 기존 /api/chat 엔드포인트 호출
async function fetchNonStreaming(
  requestBody: Record<string, unknown>,
  signal: AbortSignal
): Promise<{ response: string; error?: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(requestBody),
  });

  if (res.ok) {
    const data = await res.json();
    return { response: data.response };
  }

  const errorData = await res.json().catch(() => ({ error: "Failed to parse error" }));
  let errorMessage = "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.";

  if (errorData.error === "Invalid session" || errorData.error === "Session not found") {
    errorMessage = "세션에 문제가 있습니다. 페이지를 새로고침하고 다시 시도해주세요.";
  } else if (errorData.error === "Missing required fields") {
    errorMessage = "필수 정보가 누락되었습니다. 다시 시도해주세요.";
  }

  return { response: errorMessage, error: errorData.error };
}

export function useExamChat({
  exam,
  userId,
  sessionId,
  currentQuestion,
  scrollToBottom,
}: UseExamChatOptions): UseExamChatReturn {
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const currentQuestionChatHistory = chatHistory.filter(
    (msg) => msg.qIdx === currentQuestion
  );

  const sendChatMessage = useCallback(async () => {
    if (!chatMessage.trim()) return;

    const actualSessionId =
      sessionId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const userMessage: ChatMessage = {
      type: "user",
      message: chatMessage,
      timestamp: new Date().toISOString(),
      qIdx: currentQuestion,
    };
    setChatHistory((prev) => [...prev, userMessage]);
    const currentMsg = chatMessage;
    setChatMessage("");
    setIsLoading(true);
    setIsTyping(true);
    scrollToBottom();

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 60-second timeout for streaming (longer than non-streaming since first token arrives quickly)
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const requestBody = {
      message: currentMsg,
      sessionId: actualSessionId,
      questionIdx: currentQuestion,
      questionId: exam?.questions?.[currentQuestion]?.id,
      examTitle: exam?.title,
      examCode: exam?.code,
      examId: exam?.id,
      studentId: userId,
      currentQuestionText: exam?.questions?.[currentQuestion]?.text,
      currentQuestionAiContext: exam?.questions?.[currentQuestion]?.ai_context,
    };

    try {
      // 스트리밍 엔드포인트 먼저 시도
      const streamResponse = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (streamResponse.ok && streamResponse.headers.get("content-type")?.includes("text/event-stream")) {
        // 스트리밍 응답 처리: 실시간으로 UI에 텍스트 추가
        // 빈 assistant 메시지 추가 후, 델타마다 업데이트
        const assistantMsgTimestamp = new Date().toISOString();
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", message: "", timestamp: assistantMsgTimestamp, qIdx: currentQuestion },
        ]);

        await consumeStream(
          streamResponse,
          (delta) => {
            setChatHistory((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].type === "assistant" && updated[lastIdx].timestamp === assistantMsgTimestamp) {
                updated[lastIdx] = { ...updated[lastIdx], message: updated[lastIdx].message + delta };
              }
              return updated;
            });
            scrollToBottom();
          },
          controller.signal
        );
      } else if (streamResponse.ok) {
        // JSON 응답 (스트리밍 아님) — 비스트리밍 경로로 처리
        const data = await streamResponse.json();
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", message: data.response, timestamp: new Date().toISOString(), qIdx: currentQuestion },
        ]);
      } else {
        // 스트리밍 엔드포인트 실패 — 비스트리밍 폴백
        const fallback = await fetchNonStreaming(requestBody, controller.signal);
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", message: fallback.response, timestamp: new Date().toISOString(), qIdx: currentQuestion },
        ]);
      }
      scrollToBottom();
    } catch (err) {
      // Don't show error for intentional abort (unmount or new request)
      if (err instanceof DOMException && err.name === "AbortError") {
        // Distinguish timeout abort from intentional abort (unmount/new request)
        if (controller.signal.aborted) {
          setChatHistory((prev) => [
            ...prev,
            {
              type: "assistant",
              message: "응답 시간이 초과되었습니다. 다시 시도해주세요.",
              timestamp: new Date().toISOString(),
              qIdx: currentQuestion,
            },
          ]);
          // Restore user input on timeout
          setChatMessage(currentMsg);
          scrollToBottom();
        }
        return;
      }
      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant",
          message: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
          timestamp: new Date().toISOString(),
          qIdx: currentQuestion,
        },
      ]);
      scrollToBottom();
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [chatMessage, sessionId, currentQuestion, exam, userId, scrollToBottom]);

  return {
    chatMessage,
    setChatMessage,
    chatHistory,
    setChatHistory,
    isLoading,
    isTyping,
    sendChatMessage,
    currentQuestionChatHistory,
  };
}
