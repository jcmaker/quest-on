"use client";

import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface ChatLoadingIndicatorProps {
  isTyping: boolean;
}

export function ChatLoadingIndicator({ isTyping }: ChatLoadingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isLongLoading, setIsLongLoading] = useState(false);

  const messages = [
    "AI가 질문을 분석하고 있습니다...",
    "답변을 작성하고 있습니다...",
    "내용을 검토하고 있습니다...",
    "답변을 마무리하고 있습니다...",
  ];

  useEffect(() => {
    if (!isTyping) {
      setMessageIndex(0);
      setIsLongLoading(false);
      return;
    }

    // Message rotation every 3 seconds
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 3000);

    // Timeout warning after 30 seconds
    const timeoutTimer = setTimeout(() => {
      setIsLongLoading(true);
    }, 30000);

    return () => {
      clearInterval(messageInterval);
      clearTimeout(timeoutTimer);
    };
  }, [isTyping, messages.length]);

  if (!isTyping) return null;

  return (
    <div className="flex flex-col space-y-2 max-w-[80%]">
      <div className="bg-muted/80 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
          </div>
          <span className="text-sm text-muted-foreground animate-pulse">
            {isLongLoading
              ? "답변 생성이 지연되고 있습니다. 잠시만 더 기다려주세요..."
              : messages[messageIndex]}
          </span>
        </div>
      </div>
      {isLongLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-1 px-1">
          <AlertCircle className="w-3 h-3" />
          <span>네트워크 상태에 따라 시간이 소요될 수 있습니다.</span>
        </div>
      )}
    </div>
  );
}

interface SubmissionOverlayProps {
  isSubmitting: boolean;
}

export function SubmissionOverlay({ isSubmitting }: SubmissionOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    "답안을 안전하게 저장하고 있습니다...",
    "AI가 채점을 준비하고 있습니다...",
    "최종 데이터를 전송하고 있습니다...",
    "제출을 마무리하고 있습니다...",
  ];

  useEffect(() => {
    if (!isSubmitting) {
      setMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isSubmitting, messages.length]);

  if (!isSubmitting) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border shadow-lg rounded-lg p-8 max-w-md w-full mx-4 flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-bold">답안 제출 중</h3>
          <p className="text-muted-foreground animate-pulse min-h-[24px]">
            {messages[messageIndex]}
          </p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-left">
            제출이 완료될 때까지 창을 닫거나 이동하지 마세요.
          </span>
        </div>
      </div>
    </div>
  );
}

