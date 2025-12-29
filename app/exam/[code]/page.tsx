"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { Label } from "@/components/ui/label";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  MessageCircle,
  ArrowUp,
  AlertCircle,
  Save,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ChevronsDown,
} from "lucide-react";
import { Sparkle } from "@/components/animate-ui/icons/sparkle";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { ExamHeader } from "@/components/ExamHeader";
import {
  ChatLoadingIndicator,
  SubmissionOverlay,
} from "@/components/exam/ExamLoading";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
  ai_context?: string; // AI 컨텍스트 (레거시 core_ability 제거)
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
  status: string;
  startTime?: string;
  endTime?: string;
  rubric?: Array<{
    id?: string;
    evaluationArea: string;
    detailedCriteria: string;
  }>;
  rubric_public?: boolean;
}

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

import { cn } from "@/lib/utils";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { X } from "lucide-react";

// Exam Chat Sidebar Component
function ExamChatSidebar({
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
}: {
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
}) {
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
          <div className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:p-6 pb-28 sm:pb-32 space-y-4 sm:space-y-6 min-h-0">
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
                  <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed">
                    안녕하세요! 시험 문제에 대해 궁금한 점이 있으시면 언제든지
                    질문해주세요.
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
                        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 sm:px-5 py-3 sm:py-3.5 max-w-[85%] sm:max-w-[70%] shadow-lg shadow-primary/20 relative transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
                          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                          <p className="text-xs mt-2 sm:mt-2.5 opacity-80 text-right font-medium">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
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
            <div className="px-4 sm:px-6 py-3 bg-destructive/10 border-t border-destructive/20 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle
                    className="w-4 h-4 text-destructive shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-destructive font-medium">
                    세션 연결에 문제가 있습니다.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSessionError(false);
                    window.location.reload();
                  }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5 min-h-[44px] px-4 w-full sm:w-auto"
                  aria-label="연결 재시도"
                >
                  재시도
                </Button>
              </div>
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
                  <span className="hidden sm:inline">•</span>
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
                      <span className="hidden sm:inline">•</span>
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

// Main Content Wrapper - 중앙 정렬 처리
function MainContentWrapper({ children }: { children: React.ReactNode }) {
  const { open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  return (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-hidden transition-all duration-75 ease-out",
        // 사이드바가 닫혀있을 때만 중앙 정렬
        !isOpen && "flex items-center justify-center"
      )}
    >
      <div className="h-full w-full">{children}</div>
    </div>
  );
}

// Floating Chat Button Component
function FloatingChatButton() {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  if (isOpen) return null;

  return (
    <Button
      onClick={toggleSidebar}
      className="fixed bottom-6 right-6 h-auto px-4 py-3 rounded-full rounded-br-none shadow-lg hover:shadow-xl transition-all duration-200 z-40 border-2 border-primary flex items-center justify-center"
      aria-label="AI 채팅 열기"
    >
      <span className="text-lg font-bold relative inline-block">
        AI
        <AnimateIcon
          animateOnHover="path-loop"
          animation="path-loop"
          loop={true}
          persistOnAnimateEnd={true}
        >
          <Sparkle
            size={10}
            className="absolute -top-1 -right-2.5 text-white fill-white scale-70"
          />
        </AnimateIcon>
      </span>
    </Button>
  );
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{
      type: "user" | "assistant";
      message: string;
      timestamp: string;
      qIdx: number;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswer[]>([]);

  const [examLoading, setExamLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasOpenedQuestion, setHasOpenedQuestion] = useState(true);
  const [isQuestionVisible, setIsQuestionVisible] = useState(true);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [questionScrollTop, setQuestionScrollTop] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const questionScrollRef = useRef<HTMLDivElement>(null);

  // Filter chat history by current question
  const currentQuestionChatHistory = chatHistory.filter(
    (msg) => msg.qIdx === currentQuestion
  );

  // Helper function to check if HTML content is empty
  const isHtmlEmpty = (html: string): boolean => {
    if (!html) return true;
    // Remove HTML tags and check if there's any actual content
    const textContent = html.replace(/<[^>]*>/g, "").trim();
    return textContent.length === 0;
  };

  // Detect platform for keyboard shortcut display
  const isMac =
    typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const saveShortcut = isMac ? (
    <>
      <Kbd>⌘</Kbd>+<Kbd>S</Kbd>
    </>
  ) : (
    <>
      <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>
    </>
  );

  // Fetch exam and session data from database using optimized single call
  useEffect(() => {
    const initExam = async () => {
      if (!examCode || !isLoaded || !user) return;

      const deviceFingerprint = getDeviceFingerprint();

      try {
        // Note: Clerk session revocation is optional
        // The main protection is at the exam session level (checked in init_exam_session)
        // Uncomment below if you want to also revoke other Clerk sessions:
        /*
        try {
          const revokeResponse = await fetch(
            "/api/auth/revoke-other-sessions",
            {
              method: "POST",
            }
          );
          if (revokeResponse.ok) {
            const revokeData = await revokeResponse.json();
            console.log("[INIT_EXAM] Revoked other Clerk sessions:", revokeData);
          }
        } catch (revokeError) {
          console.error("[INIT_EXAM] Error revoking Clerk sessions:", revokeError);
          // Continue even if revocation fails
        }
        */

        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init_exam_session",
            data: {
              examCode,
              studentId: user.id,
              deviceFingerprint,
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();

          if (result.exam) {
            setExam(result.exam);

            // Initialize draft answers
            const initialDrafts = result.exam.questions.map((q: Question) => ({
              questionId: q.id,
              text: "",
            }));
            setDraftAnswers(initialDrafts);

            // Set session data
            if (result.session) {
              setSessionId(result.session.id);
              // If the session is already submitted (e.g. user reopens the page), show the submitted screen.
              if (result.session.submitted_at) {
                setIsSubmitted(true);
              }

              // Set chat history (always set, even if empty, to ensure consistency)
              if (result.messages) {
                setChatHistory(result.messages);
                console.log(
                  "[INIT_EXAM] Loaded chat history:",
                  result.messages.length,
                  "messages"
                );
              } else {
                // Explicitly set empty array if messages is not provided
                setChatHistory([]);
                console.log("[INIT_EXAM] No messages found in session");
              }
            } else {
              setSessionError(true);
            }
          } else {
            router.push("/join?error=exam_not_found");
          }
        } else {
          const errorData = await response.json().catch(() => ({}));

          router.push("/join?error=network_error");
        }
      } catch (error) {
        console.error("Error initializing exam:", error);
        router.push("/join?error=network_error");
      } finally {
        setExamLoading(false);
      }
    };

    initExam();
  }, [examCode, router, isLoaded, user]);

  // Send heartbeat periodically and handle page unload
  useEffect(() => {
    if (!sessionId || !user || isSubmitted) return;

    // Send heartbeat every 30 seconds
    const sendHeartbeat = async () => {
      try {
        await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "session_heartbeat",
            data: {
              sessionId,
              studentId: user.id,
            },
          }),
        });
      } catch (error) {
        console.error("Heartbeat error:", error);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000); // 30 seconds

    // Deactivate session on page unload
    const handleBeforeUnload = async () => {
      // Use sendBeacon for reliable delivery on page unload
      if (navigator.sendBeacon) {
        const data = JSON.stringify({
          action: "deactivate_session",
          data: {
            sessionId,
            studentId: user.id,
          },
        });
        navigator.sendBeacon("/api/supa", data);
      } else {
        // Fallback: try to send sync request (not ideal but better than nothing)
        try {
          await fetch("/api/supa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "deactivate_session",
              data: {
                sessionId,
                studentId: user.id,
              },
            }),
            keepalive: true,
          });
        } catch (error) {
          console.error("Failed to deactivate session on unload:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Deactivate session on component unmount (if not submitted)
      if (!isSubmitted) {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: {
              sessionId,
              studentId: user.id,
            },
          }),
          keepalive: true,
        }).catch(console.error);
      }
    };
  }, [sessionId, user, isSubmitted]);

  // Load saved answers from server when session is available
  useEffect(() => {
    const loadSavedAnswersFromServer = async () => {
      if (!sessionId || !exam) return;

      try {
        console.log(
          "Loading saved answers from server for session:",
          sessionId
        );

        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_session_submissions",
            data: { sessionId },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log("Server submissions result:", result);

          if (result.submissions && result.submissions.length > 0) {
            // Convert server submissions to draft answers format
            const serverAnswers = exam.questions.map((question, index) => {
              const submission = result.submissions.find(
                (sub: { q_idx: number; answer: string }) => sub.q_idx === index
              );
              return {
                questionId: question.id,
                text: submission?.answer || "",
              };
            });

            setDraftAnswers(serverAnswers);
            console.log(
              "Loaded saved answers from server:",
              serverAnswers.length
            );
          }
        }
      } catch (error) {
        console.error("Error loading saved answers from server:", error);
      }
    };

    loadSavedAnswersFromServer();
  }, [sessionId, exam]);

  // Manual save function
  const manualSave = useCallback(async () => {
    if (!sessionId || !exam) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft_answers",
          data: {
            sessionId,
            answers: draftAnswers.map((answer) => ({
              questionId: answer.questionId,
              text: answer.text?.replace(/\u0000/g, "") || "",
            })),
          },
        }),
      });

      if (response.ok) {
        setLastSaved(new Date().toLocaleTimeString());
        console.log("Answers saved manually");
      }
    } catch (error) {
      console.error("Error saving answers manually:", error);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, exam, draftAnswers]);

  // Keyboard shortcut for manual save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        manualSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [manualSave]);

  // Auto-save functionality
  const autoSaveAnswers = useCallback(async () => {
    if (!sessionId || !exam) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft_answers",
          data: {
            sessionId,
            answers: draftAnswers.map((answer) => ({
              questionId: answer.questionId,
              text: answer.text?.replace(/\u0000/g, "") || "",
            })),
          },
        }),
      });

      if (response.ok) {
        setLastSaved(new Date().toLocaleTimeString());
        console.log("Answers auto-saved successfully");
      }
    } catch (error) {
      console.error("Error auto-saving answers:", error);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, exam, draftAnswers]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        draftAnswers.some((answer) => answer.text && !isHtmlEmpty(answer.text))
      ) {
        autoSaveAnswers();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [autoSaveAnswers, draftAnswers]);

  const updateAnswer = (questionId: string, text: string) => {
    setDraftAnswers((prev) =>
      prev.map((answer) =>
        answer.questionId === questionId ? { ...answer, text } : answer
      )
    );
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) {
      return;
    }

    // Use actual session ID if available, fallback to temp
    const actualSessionId =
      sessionId ||
      `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const userMessage = {
      type: "user" as const,
      message: chatMessage,
      timestamp: new Date().toISOString(),
      qIdx: currentQuestion,
    };
    setChatHistory((prev) => [...prev, userMessage]);
    const currentMessage = chatMessage;
    setChatMessage("");
    setIsLoading(true);
    setIsTyping(true);
    // Scroll to bottom after sending user message
    scrollToBottom();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentMessage,
          sessionId: actualSessionId,
          questionIdx: currentQuestion, // Use question index instead of ID
          questionId: exam?.questions[currentQuestion]?.id, // Keep for backward compatibility
          examTitle: exam?.title,
          examCode: exam?.code,
          examId: exam?.id,
          studentId: user?.id,
          currentQuestionText: exam?.questions[currentQuestion]?.text,
          currentQuestionAiContext:
            exam?.questions[currentQuestion]?.ai_context,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        const assistantMessage = {
          type: "assistant" as const,
          message: data.response,
          timestamp: new Date().toISOString(),
          qIdx: currentQuestion,
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
        // Scroll to bottom after receiving assistant response
        scrollToBottom();
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to parse error response" }));
        console.error("Chat API error response:", errorData);

        let errorMessage =
          "죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.";

        if (
          errorData.error === "Invalid session" ||
          errorData.error === "Session not found"
        ) {
          errorMessage =
            "세션에 문제가 있습니다. 페이지를 새로고침하고 다시 시도해주세요.";
        } else if (errorData.error === "Missing required fields") {
          errorMessage = "필수 정보가 누락되었습니다. 다시 시도해주세요.";
        }

        const assistantMessage = {
          type: "assistant" as const,
          message: errorMessage,
          timestamp: new Date().toISOString(),
          qIdx: currentQuestion,
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
        // Scroll to bottom after receiving assistant response
        scrollToBottom();
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
      const errorMessage = {
        type: "assistant" as const,
        message:
          "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
        timestamp: new Date().toISOString(),
        qIdx: currentQuestion,
        type_error: "network_error", // Adding a temporary field to identify this error type if needed
      };
      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant" as const,
          message: errorMessage.message,
          timestamp: errorMessage.timestamp,
          qIdx: errorMessage.qIdx,
        },
      ]);
      // Scroll to bottom after error message
      scrollToBottom();
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Handle paste event for logging
  const handlePaste = useCallback(
    async (pasteData: {
      pastedText: string;
      pasteStart: number;
      pasteEnd: number;
      answerLengthBefore: number;
      answerTextBefore: string;
      isInternal: boolean;
    }) => {
      const {
        pastedText,
        pasteStart,
        pasteEnd,
        answerLengthBefore,
        isInternal,
      } = pasteData;

      if (isInternal) {
        console.log(
          "%c[Paste Check] ✅ Internal Copy Detected",
          "color: blue; font-weight: bold; font-size: 12px;"
        );
        console.log("Source: Internal content (from exam page)");
      } else {
        console.warn(
          "%c[Paste Check] ⚠️ External Copy Detected",
          "color: red; font-weight: bold; font-size: 12px;"
        );
        console.warn("Source: External clipboard");
      }

      console.log("Paste details:", {
        length: pastedText.length,
        start: pasteStart,
        end: pasteEnd,
        answerLengthBefore,
        isInternal,
      });

      try {
        await fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: pastedText.length,
            pasted_text: pastedText,
            paste_start: pasteStart,
            paste_end: pasteEnd,
            answer_length_before: answerLengthBefore,
            isInternal,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId: sessionId,
          }),
        });
      } catch (err) {
        console.error("Failed to log paste event", err);
      }
    },
    [examCode, exam, currentQuestion, sessionId]
  );

  const handleSubmitClick = () => {
    if (!exam) return;

    // Check if all questions have answers
    const unansweredQuestions = draftAnswers.filter((answer) =>
      isHtmlEmpty(answer.text)
    );
    if (unansweredQuestions.length > 0) {
      alert("모든 문제에 답안을 작성해주세요.");
      return;
    }

    // Check if sessionId is available
    if (!sessionId) {
      alert("세션 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
      return;
    }

    // Show confirmation dialog
    setShowSubmitConfirm(true);
  };

  const handleSubmit = async () => {
    if (!exam) return;

    setIsSubmitting(true);
    setShowSubmitConfirm(false);

    try {
      // Save current drafts first
      await manualSave();

      // Sanitize answers before sending
      const sanitizedAnswers = draftAnswers.map((answer) => ({
        ...answer,
        text: answer.text?.replace(/\u0000/g, "") || "", // Remove null characters
      }));

      // Transform chat history to match expected format for feedback API
      // Feedback API expects { type: "ai" | "student", content: string, timestamp: string }
      const transformedChatHistory = chatHistory.map((msg) => ({
        type: msg.type === "user" ? "student" : "ai",
        content: msg.message,
        timestamp: msg.timestamp,
      }));

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers: sanitizedAnswers,
          examId: exam.id,
          sessionId: sessionId,
          chatHistory: transformedChatHistory,
          studentId: user?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Submission successful:", data);
        setIsSubmitted(true);
      } else {
        alert("답안 제출에 실패했습니다. 다시 시도해주세요.");
      }
    } catch (error) {
      console.error("Error submitting answers:", error);
      alert("답안 제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Scroll to bottom of chat when message is sent or received
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  // Reset question scroll position when question changes
  useEffect(() => {
    if (questionScrollRef.current) {
      questionScrollRef.current.scrollTop = 0;
      setQuestionScrollTop(0);
    }
  }, [currentQuestion]);

  if (!isLoaded || examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-primary border-t-transparent mx-auto"></div>
          <div className="space-y-2">
            <p className="text-lg sm:text-xl font-semibold text-foreground">
              {!isLoaded ? "사용자 인증 중..." : "시험을 불러오는 중..."}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">
              잠시만 기다려주세요
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle
                className="w-8 h-8 sm:w-10 sm:h-10 text-destructive"
                aria-hidden="true"
              />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">
              로그인이 필요합니다
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              시험을 보려면 먼저 로그인해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/sign-in">
              <Button size="lg" className="min-h-[48px] px-8">
                로그인하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle
                className="w-8 h-8 sm:w-10 sm:h-10 text-destructive"
                aria-hidden="true"
              />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold">
              시험을 찾을 수 없습니다
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              시험 코드를 확인해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/join">
              <Button size="lg" className="min-h-[48px] px-8">
                다시 시도하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExamHeader
          examCode={examCode}
          duration={exam?.duration || 60}
          currentStep="exam"
          user={user}
        />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <Card className="max-w-2xl w-full shadow-xl border-0">
            <CardHeader className="text-center space-y-4 pb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2
                  className="w-10 h-10 sm:w-12 sm:h-12 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                답안이 성공적으로 제출되었습니다!
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                수고하셨습니다. 시험이 종료되었습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-sm sm:text-base text-muted-foreground">
                  제출이 완료되었습니다. 결과는 강사가 평가 후 확인할 수
                  있습니다.
                </p>
                <Button
                  onClick={() => router.push("/student")}
                  className="min-h-[52px] px-8 text-base sm:text-lg font-semibold"
                  size="lg"
                >
                  학생 대시보드로 돌아가기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      className="flex-row-reverse"
      style={
        {
          "--sidebar-width": "40vw",
          "--sidebar-width-icon": "3rem",
        } as React.CSSProperties & { [key: string]: string }
      }
    >
      {/* Chat Sidebar */}
      <ExamChatSidebar
        chatHistory={currentQuestionChatHistory}
        chatMessage={chatMessage}
        setChatMessage={setChatMessage}
        sendChatMessage={sendChatMessage}
        isLoading={isLoading}
        isTyping={isTyping}
        sessionError={sessionError}
        setSessionError={setSessionError}
        chatEndRef={chatEndRef}
        currentQuestion={currentQuestion}
      />

      {/* Main Content - Document Style Layout */}
      <SidebarInset className="flex-1 min-h-0 overflow-hidden transition-all duration-75 ease-out">
        <div className="h-screen flex flex-col bg-background">
          <SubmissionOverlay isSubmitting={isSubmitting} />
          {/* Top Header */}
          <ExamHeader
            examCode={examCode}
            duration={exam?.duration || 60}
            currentStep="exam"
            user={user}
            onExit={() => {
              if (
                confirm(
                  "정말로 시험을 그만두시겠습니까? 진행한 내용은 저장됩니다."
                )
              ) {
                router.push("/");
              }
            }}
          />

          {/* Question & Answer Section */}
          <MainContentWrapper>
            {/* Question & Answer Section */}
            <div className="bg-background h-full flex flex-col">
              {/* Top Bar with Question Toggle */}
              <div className="sticky top-0 z-[5] border-b border-border p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-background/95 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <Button
                    variant={hasOpenedQuestion ? "outline" : "default"}
                    onClick={() => {
                      setIsQuestionVisible(!isQuestionVisible);
                      if (!hasOpenedQuestion) {
                        setHasOpenedQuestion(true);
                      }
                    }}
                    className={cn(
                      "gap-2 transition-all duration-300 min-h-[44px] px-4",
                      !hasOpenedQuestion &&
                        "animate-pulse ring-2 ring-blue-500/50 ring-offset-2 shadow-lg shadow-blue-200/50 font-semibold",
                      hasOpenedQuestion
                        ? "bg-background text-foreground border-border hover:bg-muted"
                        : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50"
                    )}
                    aria-label={isQuestionVisible ? "문제 접기" : "문제 보기"}
                    aria-expanded={isQuestionVisible}
                  >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="text-sm sm:text-base">
                      {isQuestionVisible ? "문제 접기" : "문제 보기"}
                    </span>
                    {isQuestionVisible ? (
                      <ChevronUp
                        className="w-4 h-4 opacity-50 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="w-4 h-4 opacity-50 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                </div>

                {/* Navigation and Submit Button */}
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCurrentQuestion((prev) => Math.max(0, prev - 1))
                      }
                      disabled={currentQuestion === 0}
                      className="min-h-[44px] px-3 sm:px-4"
                      aria-label="이전 문제"
                    >
                      <span className="hidden sm:inline">← 이전</span>
                      <span className="sm:hidden">←</span>
                    </Button>
                    <span className="text-xs sm:text-sm text-muted-foreground font-medium px-2 sm:px-3">
                      {currentQuestion + 1} / {exam.questions.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCurrentQuestion((prev) =>
                          Math.min(exam.questions.length - 1, prev + 1)
                        )
                      }
                      disabled={currentQuestion === exam.questions.length - 1}
                      className="min-h-[44px] px-3 sm:px-4"
                      aria-label="다음 문제"
                    >
                      <span className="hidden sm:inline">다음 →</span>
                      <span className="sm:hidden">→</span>
                    </Button>
                  </div>
                  <Button
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className="min-h-[44px] sm:min-h-[48px] text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200 px-4 sm:px-6"
                    size="lg"
                    aria-label="시험 제출하기"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent mr-2"></div>
                        제출 중...
                      </>
                    ) : (
                      "시험 제출하기"
                    )}
                  </Button>
                </div>
              </div>

              {/* Resizable Vertical Layout for Question & Answer */}
              {isQuestionVisible ? (
                <ResizablePanelGroup
                  direction="vertical"
                  className="flex-1 min-h-0"
                >
                  {/* Question Content - Resizable */}
                  <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
                    <div className="relative h-full flex flex-col border-b border-border bg-muted/20">
                      <div
                        ref={questionScrollRef}
                        className="flex-1 overflow-y-auto hide-scrollbar animate-in slide-in-from-top-2 duration-300"
                        onScroll={(e) => {
                          const scrollTop = e.currentTarget.scrollTop;
                          setQuestionScrollTop(scrollTop);
                        }}
                      >
                        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
                              문제 {currentQuestion + 1}
                            </span>
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                              {exam.questions[currentQuestion]?.type === "essay"
                                ? "서술형 문제"
                                : "문제"}
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              배점: {exam.questions[currentQuestion]?.points}점
                            </span>
                          </div>

                          {/* Question Content */}
                          <div className="bg-card p-4 sm:p-5 rounded-lg border border-border shadow-sm">
                            <CopyProtector>
                              <RichTextViewer
                                content={
                                  exam.questions[currentQuestion]?.text || ""
                                }
                                className="text-sm sm:text-base leading-relaxed"
                              />
                            </CopyProtector>
                          </div>

                          {/* Requirements */}
                          <div className="bg-muted/40 p-3 sm:p-4 rounded-lg border border-border">
                            <h4 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base text-foreground">
                              요구사항
                            </h4>
                            <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                              <li className="flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span>
                                <span>문제를 정확히 이해하고 답변하세요</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-primary mt-0.5">•</span>
                                <span>
                                  풀이 과정을 단계별로 명확히 작성하세요
                                </span>
                              </li>
                            </ul>
                          </div>

                          {/* Rubric - 공개된 경우에만 표시 */}
                          {exam.rubric_public &&
                            exam.rubric &&
                            exam.rubric.length > 0 && (
                              <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 p-4 sm:p-5 rounded-lg mt-4 shadow-sm">
                                <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                  <span className="text-lg">📋</span>
                                  <span>평가 기준 (루브릭)</span>
                                </h4>
                                <div className="space-y-2.5 sm:space-y-3">
                                  {exam.rubric.map((item, index) => (
                                    <div
                                      key={item.id || index}
                                      className="bg-white dark:bg-blue-900/20 p-3 sm:p-4 rounded-md border border-blue-100 dark:border-blue-800/50 shadow-sm"
                                    >
                                      <div className="font-semibold text-sm sm:text-base text-blue-800 dark:text-blue-200 mb-1.5 sm:mb-2">
                                        {item.evaluationArea ||
                                          `평가 영역 ${index + 1}`}
                                      </div>
                                      <div className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                                        {item.detailedCriteria ||
                                          "세부 기준 미설정"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-3 sm:mt-4 italic">
                                  이 평가 기준에 따라 답안이 평가됩니다.
                                </p>
                              </div>
                            )}
                        </div>
                      </div>
                      {/* Scroll Down Button - Only visible at top, positioned at bottom */}
                      {questionScrollTop === 0 && (
                        <div className="sticky bottom-0 left-0 right-0 z-20 flex justify-center pb-2 pt-2 bg-gradient-to-t from-muted/20 via-muted/20 to-transparent pointer-events-none">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              questionScrollRef.current?.scrollTo({
                                top: 100,
                                behavior: "smooth",
                              });
                            }}
                            className="rounded-full bg-transparent hover:bg-transparent border-transparent hover:border-transparent min-h-[44px] px-4 gap-2 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
                            aria-label="더 읽기"
                          >
                            <ChevronsDown
                              className="w-4 h-4 animate-bounce"
                              aria-hidden="true"
                            />
                          </Button>
                        </div>
                      )}
                    </div>
                  </ResizablePanel>

                  {/* Resizable Handle */}
                  <ResizableHandle withHandle />

                  {/* Answer Section - Resizable */}
                  <ResizablePanel defaultSize={60} minSize={30}>
                    <div className="flex-1 overflow-y-auto hide-scrollbar min-h-0 bg-muted/20">
                      {/* Document-style container with max-width and center alignment */}
                      <div className="max-w-4xl mx-auto bg-background min-h-full">
                        <div className="p-4 sm:p-6 lg:p-8">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                            <Label className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                              <span className="text-muted-foreground">
                                답안 작성
                              </span>
                            </Label>

                            {/* Save Status Indicator */}
                            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                              {isSaving ? (
                                <div className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-primary border-t-transparent"></div>
                                  <span className="font-medium">
                                    저장 중...
                                  </span>
                                </div>
                              ) : lastSaved ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <Save
                                      className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 dark:text-green-400"
                                      aria-hidden="true"
                                    />
                                    <span className="font-medium text-green-600 dark:text-green-400">
                                      저장됨
                                    </span>
                                  </div>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="text-xs">{lastSaved}</span>
                                  <span className="hidden sm:flex items-center gap-1 text-xs">
                                    <span>•</span>
                                    {saveShortcut}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Save
                                    className="w-3 h-3 sm:w-4 sm:h-4"
                                    aria-hidden="true"
                                  />
                                  <span>자동 저장</span>
                                  <span className="hidden sm:flex items-center gap-1 text-xs">
                                    <span>•</span>
                                    {saveShortcut}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Answer Editor - Word/Google Docs style */}
                          <div className="w-full space-y-4 mb-6 sm:mb-8">
                            {/* Paper-like container - A4 format */}
                            <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-sm shadow-sm min-h-[1123px] sm:min-h-[1123px] lg:min-h-[1123px] w-full">
                              <AnswerTextarea
                                placeholder="여기에 상세한 답안을 작성하세요...&#10;&#10;• 문제의 핵심을 파악하여 답변하세요&#10;• 풀이 과정을 단계별로 명확히 작성하세요&#10;• AI와의 대화를 통해 필요한 정보를 얻을 수 있습니다"
                                value={
                                  draftAnswers[currentQuestion]?.text || ""
                                }
                                onChange={(value) =>
                                  updateAnswer(
                                    exam.questions[currentQuestion].id,
                                    value
                                  )
                                }
                                onPaste={handlePaste}
                                className="!min-h-[1123px] !border-0 !shadow-none !focus:ring-0 !p-4 sm:!p-6 lg:!p-8 !text-base sm:!text-lg !leading-relaxed !font-sans !resize-none !bg-transparent !w-full"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <div className="flex-1 overflow-y-auto hide-scrollbar min-h-0 bg-muted/20">
                  {/* Document-style container with max-width and center alignment */}
                  <div className="max-w-4xl mx-auto bg-background min-h-full">
                    <div className="p-4 sm:p-6 lg:p-8">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <Label className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                          <span className="text-muted-foreground">
                            답변 작성
                          </span>
                        </Label>

                        {/* Save Status Indicator */}
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                          {isSaving ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2 border-primary border-t-transparent"></div>
                              <span className="font-medium">저장 중...</span>
                            </div>
                          ) : lastSaved ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <Save
                                  className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 dark:text-green-400"
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-green-600 dark:text-green-400">
                                  저장됨
                                </span>
                              </div>
                              <span className="hidden sm:inline">•</span>
                              <span className="text-xs">{lastSaved}</span>
                              <span className="hidden sm:flex items-center gap-1 text-xs">
                                <span>•</span>
                                {saveShortcut}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Save
                                className="w-3 h-3 sm:w-4 sm:h-4"
                                aria-hidden="true"
                              />
                              <span>자동 저장</span>
                              <span className="hidden sm:flex items-center gap-1 text-xs">
                                <span>•</span>
                                {saveShortcut}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Answer Editor - Word/Google Docs style */}
                      <div className="w-full space-y-4 mb-6 sm:mb-8">
                        {/* Paper-like container - A4 format */}
                        <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-sm shadow-sm min-h-[1123px] sm:min-h-[1123px] lg:min-h-[1123px] w-full">
                          <AnswerTextarea
                            placeholder="여기에 상세한 답안을 작성하세요...&#10;&#10;• 문제의 핵심을 파악하여 답변하세요&#10;• 풀이 과정을 단계별로 명확히 작성하세요&#10;• AI와의 대화를 통해 필요한 정보를 얻을 수 있습니다"
                            value={draftAnswers[currentQuestion]?.text || ""}
                            onChange={(value) =>
                              updateAnswer(
                                exam.questions[currentQuestion].id,
                                value
                              )
                            }
                            onPaste={handlePaste}
                            className="!min-h-[1123px] !border-0 !shadow-none !focus:ring-0 !p-4 sm:!p-6 lg:!p-8 !text-base sm:!text-lg !leading-relaxed !font-sans !resize-none !bg-transparent !w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </MainContentWrapper>

          {/* Submit Confirmation Dialog */}
          <AlertDialog
            open={showSubmitConfirm}
            onOpenChange={setShowSubmitConfirm}
          >
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg sm:text-xl font-bold">
                  시험 제출 확인
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm sm:text-base">
                  정말로 시험을 제출하시겠습니까?
                  <br />
                  <span className="font-semibold text-foreground mt-2 block">
                    제출 후에는 답안을 수정할 수 없습니다.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-3">
                <AlertDialogCancel className="min-h-[44px]">
                  취소
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSubmit}
                  className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  제출하기
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
