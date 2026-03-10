"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ChatLoadingIndicator } from "@/components/exam/ExamLoading";
import { MessageCircle, ArrowUp, X } from "lucide-react";
import { CopyMessageButton } from "@/components/chat/CopyMessageButton";
import { FloatingChatButton } from "./FloatingChatButton";

const AIMessageRenderer = dynamic(
  () => import("@/components/chat/AIMessageRenderer"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-[92%] rounded-3xl rounded-tl-md border border-border/60 bg-muted/60 px-4 py-3 sm:max-w-[82%] lg:max-w-[68%] xl:max-w-[55%]">
        <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/15" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/10" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted-foreground/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted-foreground/10" />
        </div>
      </div>
    ),
  }
);

interface ExamChatSidebarProps {
  chatHistory: Array<{
    type: "user" | "assistant";
    message: string;
    timestamp: string;
    qIdx: number;
  }>;
  chatMessage: string;
  setChatMessage: (value: string) => void;
  sendChatMessage: () => void;
  isLoading: boolean;
  isTyping: boolean;
  sessionError: boolean;
  setSessionError: (value: boolean) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  currentQuestion: number;
}

export function ExamChatSidebar({
  chatHistory,
  chatMessage,
  setChatMessage,
  sendChatMessage,
  isLoading,
  isTyping,
  sessionError,
  setSessionError,
  chatEndRef,
  currentQuestion,
}: ExamChatSidebarProps) {
  const { setOpen, isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      <Sidebar side="right" variant="floating" collapsible="offcanvas">
        <SidebarHeader className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>AI 도우미</span>
              </div>
              <div className="text-xs text-muted-foreground">
                문제 {currentQuestion + 1} 관련 대화
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => (isMobile ? setOpenMobile(false) : setOpen(false))}
              aria-label="채팅 사이드바 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col">
          {/* Chat Messages */}
          <div
            className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:p-6 pb-28 sm:pb-32 space-y-4 sm:space-y-6 min-h-0"
            aria-live="polite"
            aria-label="채팅 메시지"
          >
            <CopyProtector className="min-h-full flex flex-col gap-4 sm:gap-6">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center my-auto px-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 shadow-sm">
                    <MessageCircle
                      className="w-8 h-8 sm:w-10 sm:h-10 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                    AI와 대화를 시작하세요
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed mb-4">
                    AI를 활용하여 문제를 분석하고 풀이 방향을 탐색해보세요.
                  </p>
                </div>
              ) : (
                <>
                  {chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.type === "user" ? "justify-end" : "justify-start"
                      } animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                      {msg.type === "user" ? (
                        <div className="group bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 sm:px-5 py-3 sm:py-3.5 max-w-[85%] sm:max-w-[70%] shadow-lg shadow-primary/20 relative transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
                          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-2 sm:mt-2.5">
                            <CopyMessageButton text={msg.message} className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" />
                            <p className="text-xs opacity-80 font-medium">
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <AIMessageRenderer
                          content={msg.message}
                          timestamp={msg.timestamp}
                        />
                      )}
                    </div>
                  ))}

                  {/* Typing Indicator */}
                  <div className="flex justify-start">
                    <ChatLoadingIndicator isTyping={isTyping} />
                  </div>
                </>
              )}
            </CopyProtector>
            <div ref={chatEndRef} />
          </div>

          {/* Error Message */}
          {sessionError && (
            <div className="px-4 sm:px-6 py-3">
              <ErrorAlert
                message="세션 연결에 문제가 있습니다."
                onRetry={() => {
                  setSessionError(false);
                  window.location.reload();
                }}
              />
            </div>
          )}

          {/* Chat Input */}
          <div className="border-t border-border p-2 sm:p-3 bg-background">
            <InputGroup className="bg-background shadow-md">
              <InputGroupTextarea
                placeholder="AI에게 질문하기..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isLoading) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                disabled={isLoading || sessionError}
                className="min-h-[40px] sm:min-h-[44px] text-sm resize-none"
                aria-label="AI에게 질문 입력"
                rows={1}
              />
              <InputGroupAddon align="block-end">
                <InputGroupText className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 px-2">
                  <span className="hidden sm:flex items-center gap-1">
                    <Kbd>Enter</Kbd>
                    <span>전송</span>
                  </span>
                  <span className="hidden sm:inline">&bull;</span>
                  <span className="hidden sm:flex items-center gap-1">
                    <KbdGroup>
                      <Kbd>Shift</Kbd>
                      <span>+</span>
                      <Kbd>Enter</Kbd>
                    </KbdGroup>
                    <span>줄바꿈</span>
                  </span>
                  {sessionError && (
                    <>
                      <span className="hidden sm:inline">&bull;</span>
                      <span className="text-destructive">연결 오류</span>
                    </>
                  )}
                </InputGroupText>
                <InputGroupText className="ml-auto text-xs text-muted-foreground px-2">
                  {chatMessage.length}자
                </InputGroupText>
                <Separator orientation="vertical" className="!h-5 sm:!h-6" />
                <InputGroupButton
                  variant="default"
                  className="rounded-full min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px]"
                  size="icon-xs"
                  onClick={sendChatMessage}
                  disabled={isLoading || !chatMessage.trim() || sessionError}
                  aria-label="메시지 전송"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">전송</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </SidebarContent>
      </Sidebar>

      {/* Floating Chat Button */}
      <FloatingChatButton />
    </>
  );
}
