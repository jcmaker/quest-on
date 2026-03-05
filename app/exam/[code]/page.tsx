"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
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
import { ErrorAlert } from "@/components/ui/error-alert";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { QuestionPanel } from "@/components/exam/QuestionPanel";
import { AnswerPanel } from "@/components/exam/AnswerPanel";
import { SubmitConfirmDialog } from "@/components/exam/SubmitConfirmDialog";
import { useAutoSave } from "@/hooks/useAutoSave";
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
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import { Sparkle } from "@/components/animate-ui/icons/sparkle";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { ExamHeader } from "@/components/ExamHeader";
import {
  ChatLoadingIndicator,
  SubmissionOverlay,
} from "@/components/exam/ExamLoading";
import { PreflightModal } from "@/components/exam/PreflightModal";
import { WaitingRoom } from "@/components/exam/WaitingRoom";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
  title?: string; // 문제 제목
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
  allow_draft_in_waiting?: boolean;
  allow_chat_in_waiting?: boolean;
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
                  <p className="text-sm sm:text-base text-muted-foreground max-w-md leading-relaxed mb-4">
                    AI를 활용하여 문제를 분석하고 풀이 방향을 탐색해보세요.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {["이 문제를 분석해줘", "힌트를 줘", "풀이 방향을 제안해줘"].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          setChatMessage(prompt);
                        }}
                        className="px-3 py-1.5 text-xs sm:text-sm rounded-full border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
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
            {/* Quick prompts (always accessible) */}
            {chatHistory.length > 0 && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto hide-scrollbar">
                {["분석해줘", "힌트", "풀이 방향"].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setChatMessage(prompt)}
                    className="px-2.5 py-1 text-xs rounded-full border border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 transition-colors whitespace-nowrap shrink-0"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
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
      className="ai-chat-button fixed bottom-6 right-6 h-auto px-4 py-3 rounded-2xl rounded-br-sm shadow-lg hover:shadow-xl transition-all duration-200 z-40 border-2 border-primary flex items-center justify-center"
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
  const queryClient = useQueryClient();
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
  const [examInitialized, setExamInitialized] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasOpenedQuestion, setHasOpenedQuestion] = useState(true);
  const [isQuestionVisible, setIsQuestionVisible] = useState(true);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(
    null
  );
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  // Gate 방식 상태 관리
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [showPreflight, setShowPreflight] = useState(false);
  const [isInWaitingRoom, setIsInWaitingRoom] = useState(false);
  // 자동 제출 실패 상태
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [manualSubmitFailed, setManualSubmitFailed] = useState(false);
  // 그만두기 확인 다이얼로그
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // 미작성 문제 다이얼로그
  const [unansweredDialog, setUnansweredDialog] = useState<{ open: boolean; indices: number[] }>({ open: false, indices: [] });
  // Preflight 취소 확인 다이얼로그
  const [showPreflightCancelConfirm, setShowPreflightCancelConfirm] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-save hook (handles draftAnswers, save logic, keyboard shortcut, interval)
  const {
    draftAnswers,
    setDraftAnswers,
    lastSaved,
    isSaving,
    saveError,
    isOnline,
    manualSave,
    updateAnswer,
    saveViaBeacon,
  } = useAutoSave({
    sessionId,
    examExists: !!exam,
    intervalMs: 30000,
  });

  // Ref for saveViaBeacon to use in beforeunload
  const saveViaBeaconRef = useRef(saveViaBeacon);
  saveViaBeaconRef.current = saveViaBeacon;

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

  // Profile gate: ensure student has a profile before entering exam
  const [profileGateChecked, setProfileGateChecked] = useState(false);
  const { data: profileGateData } = useQuery({
    queryKey: ["student-profile-gate", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/student/profile");
      if (!response.ok) return { hasProfile: false };
      const data = await response.json();
      return { hasProfile: !!data.profile };
    },
    enabled: !!user && isLoaded,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!profileGateData || profileGateChecked) return;
    if (!profileGateData.hasProfile) {
      router.replace(`/student/profile-setup?redirect=${encodeURIComponent(`/exam/${examCode}`)}`);
      return;
    }
    setProfileGateChecked(true);
  }, [profileGateData, profileGateChecked, router, examCode]);

  const { data: initData, isLoading: initLoading } = useQuery({
    queryKey: ["exam-session-init", examCode, user?.id],
    queryFn: async () => {
      try {
        const deviceFingerprint = getDeviceFingerprint();
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "init_exam_session",
            data: { examCode, studentId: user!.id, deviceFingerprint },
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { ok: false as const, errorData };
        }
        return { ok: true as const, ...(await response.json()) };
      } catch {
        return { ok: false as const, errorData: { error: "NETWORK_ERROR" } };
      }
    },
    enabled: !!examCode && isLoaded && !!user && profileGateChecked,
    retry: false,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  const examLoading = initLoading || (!examInitialized && !initData);

  useEffect(() => {
    if (!initData) return;

    if (!initData.ok) {
      const { errorData } = initData;
      if (errorData.error === "Exam already submitted" || errorData.isRetakeBlocked) {
        router.push("/join?error=already_submitted");
      } else {
        const errorCodeMap: Record<string, string> = {
          UNAUTHORIZED: "unauthorized",
          EXAM_NOT_FOUND: "exam_not_found",
          EXAM_NOT_AVAILABLE: "exam_not_available",
          ENTRY_WINDOW_CLOSED: "entry_window_closed",
          INIT_SESSION_FAILED: "server_error",
          NETWORK_ERROR: "network_error",
        };
        const errorParam = errorCodeMap[errorData.error] || "network_error";
        router.push(`/join?error=${errorParam}`);
      }
      return;
    }

    if (!initData.exam) {
      router.push("/join?error=exam_not_found");
      return;
    }

    setExam(initData.exam);

    if (initData.isRetakeBlocked) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    if (initData.autoSubmitted || initData.timeExpired) {
      setIsSubmitted(true);
      setSessionId(initData.session.id);
      if (initData.messages) setChatHistory(initData.messages);
      setExamInitialized(true);
      return;
    }

    // Initialize draft answers with server submissions if available
    const submissions = initData.submissions || [];
    setDraftAnswers(
      initData.exam.questions.map((q: Question, index: number) => {
        const submission = submissions.find(
          (sub: { q_idx: number; answer: string }) => sub.q_idx === index
        );
        return { questionId: q.id, text: submission?.answer || "" };
      })
    );

    if (initData.session) {
      setSessionId(initData.session.id);

      const currentSessionStatus =
        initData.sessionStatus || initData.session.status || "not_joined";
      setSessionStatus(currentSessionStatus);

      if (
        currentSessionStatus === "joined" ||
        (!initData.session.preflight_accepted_at &&
          currentSessionStatus !== "in_progress" &&
          currentSessionStatus !== "submitted" &&
          currentSessionStatus !== "auto_submitted")
      ) {
        setShowPreflight(true);
      }

      if (currentSessionStatus === "waiting") {
        setIsInWaitingRoom(true);
      }

      if (initData.sessionStartTime) {
        setSessionStartTime(initData.sessionStartTime);
      } else if (initData.session.created_at) {
        setSessionStartTime(initData.session.created_at);
      }

      if (initData.timeRemaining !== undefined) {
        setTimeRemaining(initData.timeRemaining);
      }

      if (initData.session.submitted_at) {
        setIsSubmitted(true);
      }

      if (initData.messages) {
        setChatHistory(initData.messages);
      } else {
        setChatHistory([]);
      }
    } else {
      setSessionError(true);
    }

    // Show session restoration toast if reactivated
    if (initData.sessionReactivated) {
      toast.success("이전 세션이 복원되었습니다. 답안이 유지되어 있습니다.", {
        duration: 4000,
        icon: "🔄",
      });
    }

    setExamInitialized(true);
  }, [initData, router]);

  const { data: heartbeatData } = useQuery({
    queryKey: ["session-heartbeat", sessionId],
    queryFn: async () => {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "session_heartbeat",
          data: { sessionId, studentId: user!.id },
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!sessionId && !!user && !isSubmitted,
    // Shorten heartbeat to 30s in last 5 minutes for better timer accuracy
    refetchInterval: timeRemaining !== null && timeRemaining <= 300 ? 30000 : 60000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!heartbeatData) return;
    if (heartbeatData.timeExpired || heartbeatData.autoSubmitted) {
      setIsSubmitted(true);
    }
    if (heartbeatData.timeRemaining !== undefined) {
      setTimeRemaining(heartbeatData.timeRemaining);
    }
  }, [heartbeatData]);

  useEffect(() => {
    if (!sessionId || !user || isSubmitted) return;

    const handleBeforeUnload = () => {
      // Save draft answers before deactivating session
      saveViaBeaconRef.current();

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/supa",
          JSON.stringify({
            action: "deactivate_session",
            data: { sessionId, studentId: user.id },
          })
        );
      } else {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (!isSubmitted) {
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "deactivate_session",
            data: { sessionId, studentId: user.id },
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [sessionId, user, isSubmitted]);

  // Warn user about unsaved answers when closing/refreshing tab during exam
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    const handleUnsavedWarning = (e: BeforeUnloadEvent) => {
      const hasContent = draftAnswers.some(
        (a) => a.text && a.text.replace(/<[^>]*>/g, "").trim().length > 0
      );
      if (hasContent) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleUnsavedWarning);
    return () =>
      window.removeEventListener("beforeunload", handleUnsavedWarning);
  }, [sessionId, exam, isSubmitted, draftAnswers]);

  // Block browser back button during exam (SPA nav guard)
  useEffect(() => {
    if (!sessionId || !exam || isSubmitted) return;

    // Push a dummy state so we can intercept the back button
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      // Re-push state to prevent navigation
      window.history.pushState(null, "", window.location.href);
      setShowExitConfirm(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sessionId, exam, isSubmitted]);

  // Detect tab switches (visibilitychange) for anti-cheat monitoring
  useEffect(() => {
    if (!sessionId || !user || isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Student switched away from exam tab — log it
        fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: 0,
            pasted_text: "[TAB_SWITCH]",
            paste_start: 0,
            paste_end: 0,
            answer_length_before: 0,
            isInternal: false,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
            sessionId,
          }),
        }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [sessionId, user, isSubmitted, examCode, exam, currentQuestion]);

  // Show toast on network reconnect
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      toast.success("네트워크 연결이 복원되었습니다. 답안을 저장하는 중...", {
        duration: 3000,
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  // Keyboard shortcuts: Alt+1~9 for question navigation
  useEffect(() => {
    if (!exam || isSubmitted) return;

    const handleQuestionShortcut = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= Math.min(9, exam.questions.length)) {
        e.preventDefault();
        setCurrentQuestion(num - 1);
      }
    };

    document.addEventListener("keydown", handleQuestionShortcut);
    return () => document.removeEventListener("keydown", handleQuestionShortcut);
  }, [exam, isSubmitted]);

  // manualSave, updateAnswer, auto-save interval, and Ctrl+S are handled by useAutoSave hook

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
    } catch {
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
      } catch {
        // Paste logging failure is non-critical
      }
    },
    [examCode, exam, currentQuestion, sessionId]
  );

  const handleSubmitClick = () => {
    if (!exam) return;

    // Check if all questions have answers
    const unansweredIndices = draftAnswers
      .map((answer, idx) => (isHtmlEmpty(answer.text) ? idx : -1))
      .filter((idx) => idx !== -1);
    if (unansweredIndices.length > 0) {
      setUnansweredDialog({ open: true, indices: unansweredIndices });
      return;
    }

    // Check if sessionId is available
    if (!sessionId) {
      toast.error("세션 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
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
        setIsSubmitted(true);
        setManualSubmitFailed(false);
      } else {
        setManualSubmitFailed(true);
      }
    } catch {
      setManualSubmitFailed(true);
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

  // QuestionPanel handles its own scroll reset via key prop

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
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/exam/${examCode}`)}`}
              onClick={() => {
                // Save redirect URL for deep link preservation through onboarding
                try { localStorage.setItem("onboarding_redirect", `/exam/${examCode}`); } catch {}
              }}
            >
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

  // Preflight Modal 수락 핸들러
  const handlePreflightAccept = async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${sessionId}/preflight`, {
        method: "POST",
      });

      if (response.ok) {
        setShowPreflight(false);
        setSessionStatus("waiting");
        setIsInWaitingRoom(true);
      } else {
        let errorData: any = {};
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try {
            errorData = await response.json();
          } catch {
            // JSON parse failed; will use text fallback below
          }
        } else {
          const text = await response.text().catch(() => "");
          errorData = { message: text || "알 수 없는 오류" };
        }
        
        // 사용자에게 에러 알림
        const errorMessage = errorData.details || errorData.message || errorData.error || "알 수 없는 오류";
        toast.error(`시험 입장 확인에 실패했습니다: ${errorMessage}`);
      }
    } catch {
      toast.error("시험 입장 확인 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  // Gate Start 신호 수신 핸들러
  const handleGateStart = () => {
    setIsInWaitingRoom(false);
    setSessionStatus("in_progress");
    // SPA 내에서 상태 전환 — React Query 캐시 무효화로 최신 데이터 로드
    queryClient.invalidateQueries({ queryKey: ["exam-session"] });
    queryClient.invalidateQueries({ queryKey: ["session-heartbeat"] });
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExamHeader
          examCode={examCode}
          duration={exam?.duration ?? 60}
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
                  제출이 완료되었습니다. AI가 답안을 채점하고 있으며, 보통 1~2분 내에 완료됩니다.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link href={`/student/report/${sessionId}`}>
                    <Button
                      className="min-h-[52px] px-8 text-base sm:text-lg font-semibold"
                      size="lg"
                    >
                      리포트 확인하기
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/student")}
                    className="min-h-[52px] px-6 text-sm sm:text-base"
                    size="lg"
                  >
                    학생 대시보드로 돌아가기
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ✅ Gate 방식: Preflight 미완료면 Preflight만, 완료 후 대기 중이면 WaitingRoom만
  if (showPreflight) {
    return (
      <>
        <PreflightModal
          open={showPreflight && !showPreflightCancelConfirm}
          onAccept={handlePreflightAccept}
          onCancel={() => setShowPreflightCancelConfirm(true)}
          examTitle={exam?.title}
          examDuration={exam?.duration}
          examDescription={exam?.description}
        />
        <AlertDialog open={showPreflightCancelConfirm} onOpenChange={setShowPreflightCancelConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>시험을 취소하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                시험 입장을 취소하면 학생 대시보드로 이동합니다. 나중에 다시 시험 코드를 입력하여 입장할 수 있습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>시험에 계속 참여하기</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => router.push("/student")}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                시험 입장 취소
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isInWaitingRoom || sessionStatus === "waiting") {
    return (
      <WaitingRoom
        examTitle={exam?.title}
        examCode={examCode}
        allowDraftInWaiting={exam?.allow_draft_in_waiting || false}
        allowChatInWaiting={exam?.allow_chat_in_waiting || false}
        onGateStart={handleGateStart}
        sessionId={sessionId || undefined}
        examId={exam?.id}
        studentId={user?.id}
        examDuration={exam?.duration}
        questionCount={exam?.questions?.length}
      />
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      className="flex-row-reverse"
      style={
        {
          "--sidebar-width": "min(40vw, 480px)",
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
          {/* Offline Banner */}
          {!isOnline && (
            <div className="bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>네트워크 연결이 끊어졌습니다. 연결이 복원되면 답안이 자동 저장됩니다.</span>
            </div>
          )}
          {/* Top Header */}
          <ExamHeader
            examCode={examCode}
            duration={exam?.duration ?? 60}
            currentStep="exam"
            user={user}
            disableLogoLink
            sessionStartTime={sessionStartTime}
            timeRemaining={timeRemaining}
            onTimeExpired={async () => {
              // ✅ 시간 종료 시 자동 제출 (최대 3회 재시도)
              if (!sessionId || !exam || isSubmitted) return;

              setIsSubmitting(true);
              setAutoSubmitFailed(false);

              const MAX_RETRIES = 3;
              let submitted = false;

              for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                  // 현재 답안 저장 후 제출
                  if (attempt === 1) await manualSave();

                  const sanitizedAnswers = draftAnswers.map((answer) => ({
                    ...answer,
                    text: answer.text?.replace(/\u0000/g, "") || "",
                  }));

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
                    setIsSubmitted(true);
                    submitted = true;
                    break;
                  }
                } catch {
                  // Retry on network errors
                }

                // Wait before retrying (exponential backoff)
                if (attempt < MAX_RETRIES) {
                  await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
              }

              if (!submitted) {
                // Ensure answers are saved even if submission failed
                try { await manualSave(); } catch {}
                setAutoSubmitFailed(true);
                toast.error("자동 제출에 실패했습니다. 수동으로 제출해주세요.");
              }
              setIsSubmitting(false);
            }}
            onExit={() => setShowExitConfirm(true)}
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
                  {/* Exam Title - Next to Question Toggle Button */}
                  <h2 className="text-sm sm:text-base font-semibold text-foreground truncate max-w-[200px] sm:max-w-none">
                    {exam.title}
                  </h2>
                </div>

                {/* Navigation and Submit Button */}
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCurrentQuestion((prev) => Math.max(0, prev - 1))
                      }
                      disabled={currentQuestion === 0}
                      className="h-8 w-8 shrink-0"
                      aria-label="이전 문제"
                    >
                      ←
                    </Button>
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
                      {exam.questions.map((_, idx) => {
                        const isCurrent = idx === currentQuestion;
                        const hasAnswer = !isHtmlEmpty(draftAnswers[idx]?.text || "");
                        const hasChat = chatHistory.some((msg) => msg.qIdx === idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => setCurrentQuestion(idx)}
                            className={cn(
                              "w-10 h-10 sm:w-8 sm:h-8 rounded-full text-xs font-medium border transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 relative",
                              isCurrent
                                ? "ring-2 ring-primary bg-primary text-primary-foreground border-primary"
                                : hasAnswer
                                ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
                                : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                            )}
                            aria-label={`문제 ${idx + 1}${isCurrent ? " (현재)" : ""}${hasAnswer ? " (작성됨)" : " (미작성)"}${hasChat ? " (채팅 있음)" : ""}`}
                          >
                            {idx + 1}
                            {hasChat && (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border border-background" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setCurrentQuestion((prev) =>
                          Math.min(exam.questions.length - 1, prev + 1)
                        )
                      }
                      disabled={currentQuestion === exam.questions.length - 1}
                      className="h-8 w-8 shrink-0"
                      aria-label="다음 문제"
                    >
                      →
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
                  <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
                    <QuestionPanel
                      question={exam.questions[currentQuestion]}
                      questionNumber={currentQuestion + 1}
                      rubric={exam.rubric}
                      rubricPublic={exam.rubric_public}
                    />
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  <ResizablePanel defaultSize={60} minSize={30}>
                    <AnswerPanel
                      value={draftAnswers[currentQuestion]?.text || ""}
                      onChange={(value) =>
                        updateAnswer(
                          exam.questions[currentQuestion].id,
                          value
                        )
                      }
                      onPaste={handlePaste}
                      isSaving={isSaving}
                      lastSaved={lastSaved}
                      saveError={saveError}
                      saveShortcut={saveShortcut}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <AnswerPanel
                  value={draftAnswers[currentQuestion]?.text || ""}
                  onChange={(value) =>
                    updateAnswer(
                      exam.questions[currentQuestion].id,
                      value
                    )
                  }
                  onPaste={handlePaste}
                  isSaving={isSaving}
                  lastSaved={lastSaved}
                  saveError={saveError}
                  saveShortcut={saveShortcut}
                  fullHeight
                />
              )}
            </div>
          </MainContentWrapper>

          <SubmitConfirmDialog
            open={showSubmitConfirm}
            onOpenChange={setShowSubmitConfirm}
            onConfirm={handleSubmit}
          />
        </div>
      </SidebarInset>

      {/* 그만두기 확인 다이얼로그 */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 그만두시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              진행한 내용은 저장됩니다. 시험을 종료하고 학생 대시보드로 이동합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 응시</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await manualSave();
                router.push("/student");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              그만두기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 미작성 문제 안내 다이얼로그 */}
      <AlertDialog open={unansweredDialog.open} onOpenChange={(open) => setUnansweredDialog((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>미작성 문제가 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredDialog.indices.length}개의 문제에 답안이 작성되지 않았습니다. 해당 문제로 이동하거나, 현재 상태로 제출할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {unansweredDialog.indices.map((idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  setCurrentQuestion(idx);
                  setUnansweredDialog({ open: false, indices: [] });
                }}
              >
                문제 {idx + 1}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnansweredDialog({ open: false, indices: [] });
                setShowSubmitConfirm(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              미작성 상태로 제출하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 자동 제출 실패 알림 */}
      <AlertDialog open={autoSubmitFailed} onOpenChange={setAutoSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              자동 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              시간 만료로 인한 자동 제출에 실패했습니다. 아래 버튼을 눌러 수동으로 제출해주세요. 답안은 이미 저장되어 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={async () => {
                await manualSave();
                router.push("/student");
              }}
            >
              저장 후 나가기
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAutoSubmitFailed(false);
                handleSubmit();
              }}
            >
              수동 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 수동 제출 실패 알림 */}
      <AlertDialog open={manualSubmitFailed} onOpenChange={setManualSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              답안 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              답안 제출에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setManualSubmitFailed(false);
                handleSubmit();
              }}
            >
              다시 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
