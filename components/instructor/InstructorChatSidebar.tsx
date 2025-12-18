"use client";

import React, { useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { BotMessageSquare } from "@/components/animate-ui/icons/bot-message-square";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { ArrowUp, X } from "lucide-react";

type InstructorChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

export interface InstructorChatSidebarProps {
  context: string;
  sessionIdSeed: string;
  scopeDescription?: string;
  title?: string;
  subtitle?: string;
}

export function InstructorChatSidebar({
  context,
  sessionIdSeed,
  scopeDescription = "이 페이지의 데이터",
  title = "시험 패널",
  subtitle = "이 페이지에서 궁금한 것을 물어보세요.",
}: InstructorChatSidebarProps) {
  return (
    <>
      <InternalSidebar
        context={context}
        sessionIdSeed={sessionIdSeed}
        scopeDescription={scopeDescription}
        title={title}
        subtitle={subtitle}
      />
      <FloatingTrigger />
    </>
  );
}

function FloatingTrigger() {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  if (isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimateIcon animateOnHover="path-loop" loop={true} asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="설정 사이드바 열기"
          className="flex h-14 w-14 items-center justify-center rounded-3xl rounded-br-none bg-primary text-primary-foreground shadow-lg"
        >
          <BotMessageSquare size={32} className="-scale-x-100" />
        </button>
      </AnimateIcon>
    </div>
  );
}

function InternalSidebar({
  context,
  sessionIdSeed,
  scopeDescription,
  title,
  subtitle,
}: Required<InstructorChatSidebarProps>) {
  return (
    <Sidebar side="right" variant="floating" collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-none truncate">
              {title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {subtitle}
            </div>
          </div>
          <SidebarCloseButton />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <ChatPanel
          context={context}
          sessionIdSeed={sessionIdSeed}
          scopeDescription={scopeDescription}
        />
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarCloseButton() {
  const { setOpen, isMobile, setOpenMobile } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
      aria-label="설정 사이드바 닫기"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

function ChatPanel({
  context,
  sessionIdSeed,
  scopeDescription,
}: {
  context: string;
  sessionIdSeed: string;
  scopeDescription: string;
}) {
  const { user } = useUser();
  const userId = user?.id ?? "instructor_unknown";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<InstructorChatMessage[]>([]);

  const sessionId = useMemo(
    () => `temp_instructor_${sessionIdSeed}_${userId}`,
    [sessionIdSeed, userId]
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          questionIdx: 0,
          currentQuestionText: context,
          studentId: userId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Chat request failed");
      }
      return data as { response: string };
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response, ts: Date.now() },
      ]);
      scrollToBottom();
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          ts: Date.now(),
          content:
            err instanceof Error
              ? `오류: ${err.message}`
              : "오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        },
      ]);
      scrollToBottom();
    },
  });

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, ts: Date.now() },
    ]);
    setInput("");
    scrollToBottom();

    mutation.mutate(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-4 space-y-3">
          {messages.length === 0 && !mutation.isPending && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-sm">
                <BotMessageSquare className="h-6 w-6 -scale-x-100" />
              </div>
              <div className="space-y-1 max-w-[260px]">
                <p className="text-sm font-medium text-foreground">
                  이 페이지에 대해 무엇이든 물어보세요
                </p>
                <p className="text-xs text-muted-foreground">
                  {scopeDescription} 범위에서만 답변합니다.
                </p>
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            if (m.role === "assistant") {
              return (
                <div key={`${m.ts}-${idx}`} className="flex justify-start">
                  <AIMessageRenderer
                    content={m.content}
                    timestamp={new Date(m.ts).toISOString()}
                    variant="plain"
                  />
                </div>
              );
            }

            return (
              <div key={`${m.ts}-${idx}`} className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-br-none bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            );
          })}

          {mutation.isPending && (
            <div className="flex justify-start">
              <AIMessageRenderer
                content={"답변 생성 중..."}
                timestamp={new Date().toISOString()}
                variant="plain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="p-3 pt-2">
        <div className="rounded-[26px] border bg-background shadow-sm p-2 flex items-center justify-between gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="무엇을 도와드릴까요?"
            className="min-h-[42px] resize-none border-0 shadow-none focus-visible:ring-0 focus-visible:border-0 px-2 py-2 text-base"
            disabled={mutation.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />

          <Button
            type="button"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={send}
            disabled={mutation.isPending || !input.trim()}
            aria-label="전송"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
