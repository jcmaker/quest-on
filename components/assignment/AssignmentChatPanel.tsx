"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, User, Bot } from "lucide-react";
import type { ChatMessage } from "@/hooks/useAssignmentChat";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { Badge } from "@/components/ui/badge";

interface AssignmentChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  isSubmitted: boolean;
  assignmentPrompt: string;
  questions: { id: string; text: string; type: string }[];
  citations?: Array<{ title: string; url: string }>;
}

export function AssignmentChatPanel({
  messages,
  isLoading,
  onSendMessage,
  isSubmitted,
  assignmentPrompt,
  questions,
  citations,
}: AssignmentChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading || isSubmitted) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;
  const maxW = "max-w-3xl";

  // ---------- Initial (no messages) layout ----------
  if (!hasMessages && !isSubmitted) {
    return (
      <div className="flex flex-col h-full">
        {/* Scrollable area with the assignment prompt bubble */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className={`mx-auto w-full ${maxW}`}>
            {/* Assignment prompt */}
            {assignmentPrompt && (
              <div className="flex gap-3 mb-4">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <AIMessageRenderer
                      content={assignmentPrompt}
                      timestamp={new Date().toISOString()}
                      variant="plain"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Questions */}
            {questions.length > 0 && (
              <div className="flex gap-3 mb-6">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">과제 문제</p>
                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={q.id} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">문제 {i + 1}</span>
                          <Badge variant="outline" className="text-xs">
                            {q.type === "essay" ? "서술형" : q.type === "short-answer" ? "단답형" : "객관식"}
                          </Badge>
                        </div>
                        <RichTextViewer content={q.text} className="text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Centered input area */}
        <div className="p-4 pb-8">
          <div className={`mx-auto w-full ${maxW} space-y-3`}>
            <div className="relative rounded-2xl border border-border bg-muted/30 shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="과제에 대해 질문하거나 도움을 요청하세요..."
                className="min-h-[80px] max-h-[160px] resize-none border-0 bg-transparent rounded-2xl px-4 pt-4 pb-12 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                disabled={isLoading}
              />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground px-2">
                  AI와 대화하며 리서치 내용을 정리하세요.
                </p>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="shrink-0 h-8 w-8 rounded-full"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Conversation layout ----------
  return (
    <div className="flex flex-col h-full">
      {/* Questions header - pinned at top, independently scrollable */}
      {(assignmentPrompt || questions.length > 0) && (
        <div className="overflow-y-auto border-b border-border/40 max-h-[45%] p-4 pb-2 shrink-0">
          <div className={`mx-auto space-y-3 ${maxW}`}>
            {assignmentPrompt && (
              <div className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <AIMessageRenderer
                      content={assignmentPrompt}
                      timestamp={new Date().toISOString()}
                      variant="plain"
                    />
                  </div>
                </div>
              </div>
            )}
            {questions.length > 0 && (
              <div className="flex gap-3 pb-2">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">과제 문제</p>
                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={q.id} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">문제 {i + 1}</span>
                          <Badge variant="outline" className="text-xs">
                            {q.type === "essay" ? "서술형" : q.type === "short-answer" ? "단답형" : "객관식"}
                          </Badge>
                        </div>
                        <RichTextViewer content={q.text} className="text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className={`mx-auto space-y-4 ${maxW}`}>
          {/* Chat messages */}
          {messages.map((msg, idx) => (
            <div key={msg.id}>
              <div
                className={`flex gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.role === "user"
                      ? "rounded-tr-md bg-primary text-primary-foreground"
                      : "rounded-tl-md bg-muted"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <AIMessageRenderer
                        content={msg.content || (msg.isStreaming ? "..." : "")}
                        timestamp={new Date().toISOString()}
                        variant="plain"
                      />
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>

              {/* Citations for last AI message */}
              {msg.role === "assistant" && idx === messages.length - 1 && citations && citations.length > 0 && (
                <div className="ml-11 mt-2">
                  <div className="pt-2 border-t border-border/40 max-w-[80%]">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">참고 출처</p>
                    <div className="flex flex-col gap-1">
                      {citations.map((citation, cidx) => (
                        <a
                          key={cidx}
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-400 hover:underline truncate"
                        >
                          {cidx + 1}. {citation.title}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom input */}
      {!isSubmitted && (
        <div className="p-4 pb-8">
          <div className={`mx-auto w-full ${maxW} space-y-3`}>
            <div className="relative rounded-2xl border border-border bg-muted/30 shadow-sm focus-within:border-primary/50 focus-within:shadow-md transition-all">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="과제에 대해 질문하거나 도움을 요청하세요..."
                className="min-h-[80px] max-h-[160px] resize-none border-0 bg-transparent rounded-2xl px-4 pt-4 pb-12 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                disabled={isLoading}
              />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground px-2">
                  제출 후 대화/리서치 기반 타임어택 퀴즈가 진행됩니다.
                </p>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="shrink-0 h-8 w-8 rounded-full"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
