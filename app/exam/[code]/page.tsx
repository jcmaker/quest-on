/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef } from "react";
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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { MessageCircle, ArrowUp, AlertCircle } from "lucide-react";
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
  const { user, isLoaded } = useUser();
  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ type: "user" | "assistant"; message: string; timestamp: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswer[]>([]);

  const [examLoading, setExamLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch exam data from database
  useEffect(() => {
    const fetchExam = async () => {
      if (!examCode || !isLoaded) return;

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
  }, [examCode, router, isLoaded]);

  // Create or get existing session
  const createOrGetSession = async (examId: string) => {
    console.log("🔍 User state:", { user, isLoaded: !!user, userId: user?.id });

    if (!user) {
      console.log("❌ User not found, cannot create session");
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
        console.log("🔍 Session creation result:", result);

        setSessionId(result.session.id);

        // Load existing chat history
        if (result.messages && result.messages.length > 0) {
          console.log(
            "📨 Restoring chat history:",
            result.messages.length,
            "messages"
          );
          console.log("📨 First message:", result.messages[0]);
          setChatHistory(result.messages);
        } else {
          console.log(
            "📨 No existing messages to restore - messages array:",
            result.messages
          );
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

    // Use actual session ID if available, fallback to temp
    const actualSessionId =
      sessionId ||
      `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log("Using session ID:", actualSessionId);

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
      sessionId: actualSessionId,
      questionId: exam?.questions[currentQuestion]?.id,
    });

    try {
      console.log("Sending chat with session ID:", actualSessionId);

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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Header */}
      <div className="bg-background/95 backdrop-blur-sm border-b flex-shrink-0">
        <div className="container mx-auto px-6 py-2">
          <div className="grid grid-cols-3 items-center">
            {/* Left: AI 시험 시스템 + 진행중 배지 */}
            <div className="flex items-center space-x-3 justify-start">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                진행중
              </div>
            </div>

            {/* Center: Progress Steps */}
            <div className="flex justify-center">
              <ProgressBar currentStep="exam" />
            </div>

            {/* Right: Profile Image & Exit Button */}
            <div className="flex items-center justify-end space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      "정말로 시험을 그만두시겠습니까? 진행한 내용은 저장됩니다."
                    )
                  ) {
                    router.push("/");
                  }
                }}
                className="text-sm border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
              >
                그만두기
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={user?.imageUrl}
                  alt={user?.fullName || "User"}
                />
                <AvatarFallback>
                  {user?.firstName?.charAt(0) ||
                    user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ||
                    "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Resizable Layout */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Side - Exam Problem */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background border-r flex flex-col h-full">
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">시험 문제</h2>

                {/* Exam Info */}
                <div className="flex items-center space-x-4 mb-6">
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {Math.floor(exam.duration)}분
                  </div>
                  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {exam.questions[currentQuestion]?.type === "essay"
                      ? "서술형"
                      : exam.questions[currentQuestion]?.type === "short-answer"
                      ? "단답형"
                      : exam.questions[currentQuestion]?.type ===
                        "multiple-choice"
                      ? "객관식"
                      : "문제"}
                  </div>
                </div>

                {/* Question Number Badge */}
                <div className="mb-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    문제 {currentQuestion + 1}
                  </span>
                </div>

                {/* Question Content */}
                <div className="space-y-4">
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">문제</h3>
                    <p className="text-base leading-relaxed">
                      {exam.questions[currentQuestion]?.text}
                    </p>
                  </div>

                  {/* Requirements */}
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">요구사항</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• 문제를 정확히 이해하고 답변하세요</li>
                      <li>• 풀이 과정을 단계별로 명확히 작성하세요</li>
                    </ul>
                  </div>
                </div>

                {/* Navigation */}
                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentQuestion((prev) => Math.max(0, prev - 1))
                    }
                    disabled={currentQuestion === 0}
                  >
                    ← 이전 문제
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentQuestion + 1} / {exam.questions.length}
                  </span>
                  <Button
                    onClick={async () => {
                      await saveAllDrafts();
                      router.push(
                        `/exam/${examCode}/answer?startQuestion=${currentQuestion}`
                      );
                    }}
                    className="bg-primary hover:bg-primary/90"
                  >
                    답안 작성 →
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle />

          {/* Right Side - AI Chat */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background flex flex-col h-full relative">
              <div className="absolute top-3 left-6 z-10">
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  AI와 대화하기
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 pb-48 space-y-4 min-h-0">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
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
                    {chatHistory.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          msg.type === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        {msg.type === "user" ? (
                          <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[70%]">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.message}
                            </p>
                            <p className="text-xs mt-2 opacity-70">
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
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-muted/80 rounded-2xl px-4 py-3 max-w-[70%]">
                          <div className="flex items-center space-x-2">
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
                            <span className="text-sm text-muted-foreground">
                              AI가 응답을 작성 중...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
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

              {/* Chat Input */}
              <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center">
                <InputGroup className="bg-background">
                  <InputGroupTextarea
                    placeholder="AI에게 질문하기..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && !isLoading && sendChatMessage()
                    }
                    disabled={isLoading || sessionError}
                  />
                  <InputGroupAddon align="block-end">
                    <InputGroupText className="text-xs text-muted-foreground">
                      Enter 키로 전송 • 실시간 AI 도움
                      {sessionError && (
                        <p className="text-xs text-destructive">연결 오류</p>
                      )}
                    </InputGroupText>
                    {/* <InputGroupButton
                  variant="outline"
                  className="rounded-full"
                  size="icon-xs"
                >
                  <Plus />
                </InputGroupButton> */}
                    {/* <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <InputGroupButton variant="ghost">Auto</InputGroupButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="start"
                    className="[--radius:0.95rem]"
                  >
                    <DropdownMenuItem>Auto</DropdownMenuItem>
                    <DropdownMenuItem>Agent</DropdownMenuItem>
                    <DropdownMenuItem>Manual</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> */}
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
                {/* <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              Enter 키로 전송 • 실시간 AI 도움
            </p>
            {sessionError && (
              <p className="text-xs text-destructive">연결 오류</p>
            )}
            </div> */}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
