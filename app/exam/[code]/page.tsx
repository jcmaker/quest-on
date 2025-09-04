/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  FileText,
  MessageCircle,
  AlertCircle,
  Play,
  Pause,
} from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import ProgressBar from "@/components/ProgressBar";

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

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ type: "user" | "assistant"; message: string; timestamp: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswer[]>([]);

  const [examLoading, setExamLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch exam data from database
  useEffect(() => {
    const fetchExam = async () => {
      if (!examCode) return;

      try {
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_exam",
            data: { code: examCode },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.exam) {
            setExam(result.exam);
            setTimeRemaining(result.exam.duration * 60);

            // Initialize draft answers
            const initialDrafts = result.exam.questions.map((q: Question) => ({
              questionId: q.id,
              text: "",
            }));
            setDraftAnswers(initialDrafts);

            // Create or get session
            await createOrGetSession(result.exam.id);
          } else {
            router.push("/join?error=exam_not_found");
          }
        } else {
          router.push("/join?error=exam_not_found");
        }
      } catch (error) {
        console.error("Error fetching exam:", error);
        router.push("/join?error=network_error");
      } finally {
        setExamLoading(false);
      }
    };

    fetchExam();
  }, [examCode, router]);

  // Create or get existing session
  const createOrGetSession = async (examId: string) => {
    if (!user) {
      console.log("User not found, cannot create session");
      return;
    }

    console.log("Creating/getting session for:", {
      examId,
      studentId: user.id,
    });

    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_or_get_session",
          data: {
            examId,
            studentId: user.id,
          },
        }),
      });

      console.log("Session creation response status:", response.status);

      if (response.ok) {
        const result = await response.json();
        console.log("Session creation result:", result);

        setSessionId(result.session.id);

        // Load existing chat history
        if (result.messages) {
          setChatHistory(result.messages);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Session creation error:", errorData);
        setSessionError(true);
      }
    } catch (error) {
      console.error("Error creating session:", error);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0 || isTimerPaused) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, isTimerPaused]);

  const handleAutoSubmit = async () => {
    // Save all draft answers before auto-submit
    await saveAllDrafts();
    router.push(`/exam/${examCode}/answer`);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const saveAllDrafts = async () => {
    if (!sessionId) return;

    try {
      await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_all_drafts",
          data: {
            sessionId,
            drafts: draftAnswers,
          },
        }),
      });
    } catch (error) {
      console.error("Error saving all drafts:", error);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim()) {
      console.log("Chat message is empty");
      return;
    }

    // Always use temporary session for now to avoid database issues
    const tempId = `temp_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log("Using temporary session ID:", tempId);

    const userMessage = {
      type: "user" as const,
      message: chatMessage,
      timestamp: new Date().toISOString(),
    };
    setChatHistory((prev) => [...prev, userMessage]);
    const currentMessage = chatMessage;
    setChatMessage("");
    setIsLoading(true);
    setIsTyping(true);

    console.log("Sending chat message:", {
      message: currentMessage,
      tempId,
      questionId: exam?.questions[currentQuestion]?.id,
    });

    try {
      const actualSessionId = tempId; // Use the local variable directly
      console.log("Using temporary session ID for chat:", actualSessionId);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentMessage,
          sessionId: actualSessionId,
          questionId: exam?.questions[currentQuestion]?.id,
          examTitle: exam?.title,
          examCode: exam?.code,
          currentQuestionText: exam?.questions[currentQuestion]?.text,
          currentQuestionCoreAbility:
            exam?.questions[currentQuestion]?.core_ability,
        }),
      });

      console.log("Chat API response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Chat API response data:", data);

        const assistantMessage = {
          type: "assistant" as const,
          message: data.response,
          timestamp: new Date().toISOString(),
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to parse error response" }));
        console.error("Chat API error response:", errorData);

        // Add error message to chat with more details
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
        };
        setChatHistory((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
      // Add error message to chat
      const errorMessage = {
        type: "assistant" as const,
        message:
          "네트워크 오류가 발생했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.",
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  if (examLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-lg">시험을 불러오는 중...</p>
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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Modern Header with Timer */}
      <div className="bg-background/95 backdrop-blur-sm border-b flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-3 items-center">
            {/* Exam Info */}
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-sm">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground line-clamp-1">
                  {exam.title}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    시험 코드:
                  </span>
                  <code className="text-xs bg-muted/70 px-2 py-0.5 rounded font-mono">
                    {exam.code}
                  </code>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="flex justify-center">
              <ProgressBar currentStep="exam" />
            </div>

            {/* Navigation & Timer */}
            <div className="flex items-center justify-end gap-6">
              {/* Question Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentQuestion((prev) => Math.max(0, prev - 1))
                  }
                  disabled={currentQuestion === 0}
                >
                  ← 이전
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentQuestion + 1} / {exam.questions.length}
                </span>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white"
                  onClick={async () => {
                    await saveAllDrafts();
                    router.push(
                      `/exam/${examCode}/answer?startQuestion=${currentQuestion}`
                    );
                  }}
                >
                  답안 작성 →
                </Button>
              </div>

              {/* Timer */}
              <div className="text-right">
                <div className="flex items-center gap-2 mb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsTimerPaused(!isTimerPaused)}
                    className="h-8 w-8 p-0 hover:bg-muted"
                  >
                    {isTimerPaused ? (
                      <Play className="w-3 h-3" />
                    ) : (
                      <Pause className="w-3 h-3" />
                    )}
                  </Button>
                  <span
                    className={`text-lg font-mono font-bold px-3 py-1 rounded-full ${
                      timeRemaining < 300
                        ? "text-destructive bg-destructive/10"
                        : timeRemaining < 600
                        ? "text-yellow-600 bg-yellow-50"
                        : "text-foreground bg-muted"
                    }`}
                  >
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isTimerPaused ? "일시정지됨" : "남은 시간"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Flex Layout */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Problem Display - Compact */}
          <div className="bg-background border-b p-4 flex-shrink-0">
            <div className="container mx-auto max-w-4xl">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    문제 {currentQuestion + 1} / {exam.questions.length}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {exam.questions[currentQuestion]?.type === "essay"
                      ? "서술형"
                      : exam.questions[currentQuestion]?.type === "short-answer"
                      ? "단답형"
                      : exam.questions[currentQuestion]?.type ===
                        "multiple-choice"
                      ? "객관식"
                      : exam.questions[currentQuestion]?.type}{" "}
                    문제
                  </p>
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="text-base leading-relaxed">
                  {exam.questions[currentQuestion]?.text}
                </p>
              </div>
            </div>
          </div>

          {/* AI Chat Section - Optimized Height */}
          <div className="flex-1 flex flex-col min-h-0 mx-4 mb-4 bg-background overflow-hidden">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <MessageCircle className="w-3 h-3 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs">AI 어시스턴트</h3>
                  <p className="text-xs text-muted-foreground">
                    문제 풀이 도움
                  </p>
                </div>
              </div>
              {chatHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChatHistory([]);
                    setChatMessage("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  새 대화
                </Button>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-60 py-2 pb-20 space-y-1">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center shadow-lg">
                      <MessageCircle className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background"></div>
                  </div>
                  <h4 className="font-semibold text-foreground mb-3 text-lg">
                    AI 어시스턴트와 대화하세요
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    문제에 대해 궁금한 점이 있으시면 물어보세요.
                    <br />
                    <span className="text-primary font-medium">
                      실시간으로 답변해드립니다.
                    </span>
                  </p>
                  <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    <p className="text-xs text-muted-foreground">
                      💡 아래 입력창에 직접 메시지를 입력해보세요
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.type === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.type === "user" ? (
                        // 사용자 메시지 (개선된 스타일링)
                        <div className="bg-primary text-primary-foreground rounded-2xl px-3 py-2 max-w-[55%] shadow-sm transition-all duration-200 hover:shadow-md">
                          <div className="prose prose-sm max-w-none prose-invert">
                            <p className="text-sm leading-relaxed mb-0 whitespace-pre-wrap">
                              {msg.message}
                            </p>
                          </div>
                          <p className="text-xs mt-1 opacity-70 text-primary-foreground/80">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ) : (
                        // AI 메시지 (새로운 마크다운 렌더러 사용)
                        <AIMessageRenderer
                          content={msg.message}
                          timestamp={msg.timestamp}
                        />
                      )}
                    </div>
                  ))}

                  {/* Enhanced Typing Indicator */}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-muted/80 text-foreground border border-border/50 backdrop-blur-sm rounded-2xl px-4 py-3 max-w-[80%] shadow-sm">
                        <div className="flex items-center space-x-3">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-primary rounded-full animate-bounce"
                              style={{ animationDelay: "0.1s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-primary rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                          </div>
                          <span className="text-sm text-muted-foreground font-medium">
                            AI가 응답을 작성 중...
                          </span>
                        </div>
                        <p className="text-xs mt-2 opacity-70 text-muted-foreground">
                          실시간으로 답변을 생성하고 있습니다
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Error Message */}
            {sessionError && (
              <div className="px-4 py-3 bg-destructive/10">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-destructive">
                    세션 연결에 문제가 있습니다.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSessionError(false);
                      if (exam) {
                        createOrGetSession(exam.id);
                      }
                    }}
                    className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    재시도
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Input - Fixed at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Input
                placeholder="메시지를 입력하세요..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && !isLoading && sendChatMessage()
                }
                className="pr-12 border-2 focus:border-primary/50 bg-background/80 backdrop-blur-sm min-h-[44px] resize-none"
                disabled={isLoading || sessionError}
              />
              {chatMessage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatMessage("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                >
                  ×
                </Button>
              )}
            </div>
            <Button
              onClick={sendChatMessage}
              disabled={isLoading || !chatMessage.trim() || sessionError}
              className="h-11 px-6 shadow-sm hover:shadow-md transition-shadow"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              ) : (
                <>
                  <span className="mr-1">전송</span>
                  <span className="text-xs">↵</span>
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              Enter 키로 전송 • 실시간 AI 도움
            </p>
            {sessionError && (
              <p className="text-xs text-destructive">연결 오류</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
