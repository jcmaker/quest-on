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
import { SimpleRichTextEditor } from "@/components/ui/simple-rich-text-editor";
import { Label } from "@/components/ui/label";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
} from "lucide-react";
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
  core_ability?: string; // 문제 핵심 역량 - AI 프롬프트에 사용
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
}

interface DraftAnswer {
  questionId: string;
  text: string;
  lastSaved?: string;
}

import { cn } from "@/lib/utils";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

              // Set chat history
              if (result.messages && result.messages.length > 0) {
                setChatHistory(result.messages);
              }
            } else {
              setSessionError(true);
            }
          } else {
            router.push("/join?error=exam_not_found");
          }
        } else {
          const errorData = await response.json().catch(() => ({}));

          // Handle concurrent access error
          if (
            response.status === 409 &&
            errorData.error === "CONCURRENT_ACCESS_BLOCKED"
          ) {
            alert(
              errorData.message ||
                "이미 다른 기기에서 시험이 진행 중입니다. 동시 접속은 불가능합니다."
            );
            router.push("/");
            return;
          }

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
          currentQuestionCoreAbility:
            exam?.questions[currentQuestion]?.core_ability,
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
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Handle paste event for logging
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const clipboard = e.clipboardData;
      if (!clipboard) return;

      const text = clipboard.getData("text/plain");
      const isInternal = clipboard.types.includes(
        "application/x-queston-internal"
      );

      if (isInternal) {
        console.log(
          "%c[Paste Check] ✅ Internal Copy Detected",
          "color: green; font-weight: bold; font-size: 12px;"
        );
      } else {
        console.warn(
          "%c[Paste Check] ⚠️ External Copy Detected",
          "color: red; font-weight: bold; font-size: 12px;"
        );
      }

      try {
        await fetch("/api/log/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            length: text.length,
            isInternal,
            ts: Date.now(),
            examCode,
            questionId: exam?.questions[currentQuestion]?.id,
          }),
        });
      } catch (err) {
        console.error("Failed to log paste event", err);
      }
    },
    [examCode, exam, currentQuestion]
  );

  const handleSubmit = async () => {
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

    setIsSubmitting(true);

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

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentQuestionChatHistory]);

  if (!isLoaded || examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-lg">
            {!isLoaded ? "사용자 인증 중..." : "시험을 불러오는 중..."}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">로그인이 필요합니다</h2>
          <p className="text-muted-foreground">
            시험을 보려면 먼저 로그인해주세요.
          </p>
          <Link href="/sign-in">
            <Button>로그인하기</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">시험을 찾을 수 없습니다</h2>
          <p className="text-muted-foreground">시험 코드를 확인해주세요.</p>
          <Link href="/join">
            <Button>다시 시도하기</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <ExamHeader
          examCode={examCode}
          duration={exam?.duration || 60}
          currentStep="exam"
          user={user}
        />
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-green-600">
                답안이 성공적으로 제출되었습니다!
              </CardTitle>
              <CardDescription>
                수고하셨습니다. 시험이 종료되었습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  제출이 완료되었습니다.
                </p>
                <Button
                  onClick={() => router.push("/student")}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  메인으로 돌아가기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
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
            confirm("정말로 시험을 그만두시겠습니까? 진행한 내용은 저장됩니다.")
          ) {
            router.push("/");
          }
        }}
      />

      {/* Main Content - Resizable Layout */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Side - Chat (Previously Right) */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background flex flex-col h-full relative border-r">
              <div className="absolute top-3 left-6 z-10">
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  AI와 대화하기
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto hide-scrollbar p-6 pb-48 space-y-6 min-h-0">
                <CopyProtector className="min-h-full flex flex-col gap-6">
                  {currentQuestionChatHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center my-auto">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <MessageCircle className="w-8 h-8 text-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        안녕하세요! 시험을 시작하겠습니다. 문제를 읽고 자유롭게
                        질문해주세요.
                      </p>
                    </div>
                  ) : (
                    <>
                      {currentQuestionChatHistory.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex ${
                            msg.type === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          {msg.type === "user" ? (
                            <div className="bg-primary text-primary-foreground rounded-3xl rounded-tr-md px-5 py-3.5 max-w-[70%] shadow-lg shadow-primary/20 relative">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.message}
                              </p>
                              <p className="text-xs mt-2.5 opacity-80 text-right font-medium">
                                {new Date(msg.timestamp).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
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
                <div className="px-6 py-3 bg-destructive/10 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-destructive">
                      세션 연결에 문제가 있습니다.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSessionError(false);
                        window.location.reload();
                      }}
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    >
                      재시도
                    </Button>
                  </div>
                </div>
              )}

              {/* Chat Input */}
              <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center">
                <InputGroup className="bg-background">
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
                  />
                  <InputGroupAddon align="block-end">
                    <InputGroupText className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Kbd>Enter</Kbd>
                        <span>전송</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <KbdGroup>
                          <Kbd>Shift</Kbd>
                          <span>+</span>
                          <Kbd>Enter</Kbd>
                        </KbdGroup>
                        <span>줄바꿈</span>
                      </span>
                      {sessionError && (
                        <span className="text-destructive">• 연결 오류</span>
                      )}
                    </InputGroupText>
                    <InputGroupText className="ml-auto">
                      {chatMessage.length} 글자
                    </InputGroupText>
                    <Separator orientation="vertical" className="!h-4" />
                    <InputGroupButton
                      variant="default"
                      className="rounded-full"
                      size="icon-xs"
                      onClick={sendChatMessage}
                      disabled={
                        isLoading || !chatMessage.trim() || sessionError
                      }
                    >
                      <ArrowUp />
                      <span className="sr-only">Send</span>
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle />

          {/* Right Side - Answer (Previously Left) */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background h-full flex flex-col">
              {/* Top Bar with Question Toggle */}
              <div className="border-b p-3 flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-3">
                  <Button
                    variant={hasOpenedQuestion ? "outline" : "default"}
                    onClick={() => {
                      setIsQuestionVisible(!isQuestionVisible);
                      if (!hasOpenedQuestion) {
                        setHasOpenedQuestion(true);
                      }
                    }}
                    className={cn(
                      "gap-2 transition-all duration-500",
                      !hasOpenedQuestion &&
                        "animate-pulse ring-4 ring-blue-500/50 ring-offset-2 shadow-xl shadow-blue-200/50 font-bold scale-105",
                      "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    {isQuestionVisible ? "문제 접기" : "문제 보기"}
                    {isQuestionVisible ? (
                      <ChevronUp className="w-3 h-3 opacity-50" />
                    ) : (
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    )}
                  </Button>
                </div>

                {/* Navigation - Small version */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCurrentQuestion((prev) => Math.max(0, prev - 1))
                    }
                    disabled={currentQuestion === 0}
                  >
                    ← 이전
                  </Button>
                  <span className="text-xs text-muted-foreground">
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
                  >
                    다음 →
                  </Button>
                </div>
              </div>

              {/* Question Content - Toggleable */}
              {isQuestionVisible && (
                <div className="border-b bg-muted/30 overflow-y-auto hide-scrollbar max-h-[40vh]">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                          문제 {currentQuestion + 1}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {exam.questions[currentQuestion]?.type === "essay"
                            ? "서술형 문제"
                            : "문제"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          배점: {exam.questions[currentQuestion]?.points}점
                        </span>
                      </div>
                    </div>

                    {/* Question Content */}
                    <div className="bg-muted/50 p-4 rounded-lg border">
                      <CopyProtector>
                        <RichTextViewer
                          content={exam.questions[currentQuestion]?.text || ""}
                          className="text-base leading-relaxed"
                        />
                      </CopyProtector>
                    </div>

                    {/* Requirements */}
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <h4 className="font-semibold mb-2 text-sm">요구사항</h4>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>• 문제를 정확히 이해하고 답변하세요</li>
                        <li>• 풀이 과정을 단계별로 명확히 작성하세요</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">답안 작성</Label>

                  {/* Save Status Indicator */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isSaving ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                        <span>저장 중...</span>
                      </div>
                    ) : lastSaved ? (
                      <div className="flex items-center gap-2">
                        <Save className="w-3 h-3" />
                        <span>마지막 저장: {lastSaved}</span>
                        <span className="text-xs flex items-center gap-1">
                          • {saveShortcut}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Save className="w-3 h-3" />
                        <span>자동 저장</span>
                        <span className="text-xs flex items-center gap-1">
                          • {saveShortcut}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Answer Editor */}
                <div className="space-y-4 mb-6">
                  <SimpleRichTextEditor
                    placeholder="여기에 상세한 답안을 작성하세요..."
                    value={draftAnswers[currentQuestion]?.text || ""}
                    onChange={(value) =>
                      updateAnswer(exam.questions[currentQuestion].id, value)
                    }
                    onPaste={handlePaste}
                  />
                </div>

                {/* Submit Button */}
                <div className="mt-4">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full"
                    size="lg"
                  >
                    {isSubmitting ? "제출 중..." : "시험 제출하기"}
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
