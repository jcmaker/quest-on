"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { MessageCircle } from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import ProgressBar from "@/components/ProgressBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
}

interface Answer {
  questionId: string;
  text: string;
}

export default function AnswerSubmission() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useUser();

  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [startQuestion, setStartQuestion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  // 채팅 관련 상태
  const [chatMessages, setChatMessages] = useState<
    Array<{
      type: "ai" | "student";
      content: string;
      timestamp: string;
    }>
  >([]);
  const [chatMessage, setChatMessage] = useState("");

  const [isChatMode, setIsChatMode] = useState(false);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedChatHistory, setLoadedChatHistory] = useState<
    Array<{ type: "user" | "assistant"; message: string; timestamp: string }>
  >([]);
  const [isTyping, setIsTyping] = useState(false);

  // Handle startQuestion and chatHistory parameters from URL
  useEffect(() => {
    const startQuestionParam = searchParams.get("startQuestion");
    const chatHistoryParam = searchParams.get("chatHistory");

    console.log(
      "Answer page loaded with startQuestion param:",
      startQuestionParam
    );
    console.log("Answer page loaded with chatHistory param:", chatHistoryParam);

    if (startQuestionParam) {
      const questionIndex = parseInt(startQuestionParam, 10);
      console.log("Parsed question index:", questionIndex);

      if (!isNaN(questionIndex) && questionIndex >= 0) {
        setStartQuestion(questionIndex);
        setCurrentQuestion(questionIndex);
        console.log("Set current question to:", questionIndex);
      }
    }

    // Load chat history from URL params
    if (chatHistoryParam) {
      try {
        const parsedChatHistory = JSON.parse(
          decodeURIComponent(chatHistoryParam)
        );
        console.log("Loaded chat history from URL:", parsedChatHistory);

        // Store for display in left panel
        setLoadedChatHistory(parsedChatHistory);

        // Convert chat history format to match the expected format
        const convertedChatHistory = parsedChatHistory.map(
          (msg: Record<string, unknown>) => ({
            type: msg.type === "user" ? "student" : "ai",
            content: msg.message || msg.content,
            timestamp: msg.timestamp,
          })
        );

        setChatMessages(convertedChatHistory);
      } catch (error) {
        console.error("Error parsing chat history from URL:", error);
      }
    }
  }, [searchParams]);

  // Get or create session for this exam
  const getOrCreateSession = useCallback(
    async (examId: string) => {
      if (!user) {
        console.log("User not found, cannot create session");
        return;
      }

      console.log("Getting/creating session for:", {
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

        if (response.ok) {
          const result = await response.json();
          console.log("Session result:", result);

          if (result.session) {
            setSessionId(result.session.id);
            console.log("Session ID set:", result.session.id);

            // Load existing chat history from session if not already loaded from URL
            if (
              result.messages &&
              result.messages.length > 0 &&
              loadedChatHistory.length === 0
            ) {
              console.log(
                "Loading chat history from session:",
                result.messages.length
              );
              setLoadedChatHistory(result.messages);
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Session creation error:", errorData);
        }
      } catch (error) {
        console.error("Error creating session:", error);
      }
    },
    [user, loadedChatHistory.length]
  );

  // Fetch exam data and get/create session
  useEffect(() => {
    const fetchExamAndSession = async () => {
      if (!examCode || !user) {
        setIsLoading(false);
        return;
      }

      try {
        console.log("Fetching exam data for answer page:", examCode);
        setError(null);

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
          console.log("Exam data received:", result);

          if (result.exam) {
            setExam(result.exam);

            // Initialize answers array with actual questions
            const initialAnswers = result.exam.questions.map((q: Question) => ({
              questionId: q.id,
              text: "",
            }));
            setAnswers(initialAnswers);

            console.log(
              "Answers initialized:",
              initialAnswers.length,
              "questions"
            );

            // Get or create session for this exam
            await getOrCreateSession(result.exam.id);
          } else {
            console.error("Exam not found in database");
            setError("시험을 찾을 수 없습니다. 시험 코드를 확인해주세요.");
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to fetch exam:", errorData);
          setError("시험 데이터를 불러오는 중 오류가 발생했습니다.");
        }
      } catch (error) {
        console.error("Error fetching exam:", error);
        setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExamAndSession();
  }, [examCode, user, getOrCreateSession]);

  const updateAnswer = (questionId: string, text: string) => {
    setAnswers((prev) =>
      prev.map((answer) =>
        answer.questionId === questionId ? { ...answer, text } : answer
      )
    );
  };

  // 채팅 모드 시작 (피드백을 첫 메시지로)
  const startChatMode = () => {
    if (!feedback) return;

    // AI의 첫 피드백 메시지 추가
    const aiMessage = {
      type: "ai" as const,
      content: feedback,
      timestamp: new Date().toISOString(),
    };

    setChatMessages([aiMessage]);
    setIsChatMode(true);
  };

  // 채팅 메시지 전송
  const sendChatMessage = async () => {
    if (!chatMessage.trim()) return;

    const studentMessage = {
      type: "student" as const,
      content: chatMessage,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, studentMessage]);
    const replyContent = chatMessage; // 저장하기 전에 메시지 복사
    setChatMessage("");
    setIsTyping(true);

    // 학생의 반박 메시지를 데이터베이스에 저장 (선택적)
    if (sessionId && startQuestion !== undefined) {
      try {
        console.log("Attempting to save student reply:", {
          sessionId,
          qIdx: startQuestion,
          replyLength: replyContent.length,
        });

        const response = await fetch("/api/submission/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentReply: replyContent,
            sessionId: sessionId,
            qIdx: startQuestion,
          }),
        });

        if (response.ok) {
          console.log("Student reply saved successfully");
        } else {
          // 에러가 발생해도 조용히 처리 (submission이 아직 생성되지 않았을 수 있음)
          console.log("Note: Could not save student reply (this is okay)");
        }
      } catch {
        // 에러가 발생해도 조용히 처리
        console.log("Note: Could not save student reply (this is okay)");
      }
    }

    // 학생 답변 즉시 "수고하셨습니다" 메시지 표시
    setTimeout(() => {
      setIsTyping(false);
      const completionMessage = {
        type: "ai" as const,
        content: "exam_completed", // 특별한 식별자로 사용
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, completionMessage]);
      setConversationEnded(true);
    }, 500); // 0.5초 후에 메시지 표시
  };

  const handleSubmit = async () => {
    if (!exam) return;

    // Check if all questions have answers
    const unansweredQuestions = answers.filter((answer) => !answer.text.trim());
    if (unansweredQuestions.length > 0) {
      alert("모든 문제에 답안을 작성해주세요.");
      return;
    }

    // Check if sessionId is available
    if (!sessionId) {
      console.error("Session ID not available");
      alert("세션 정보를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit answers to API with session ID, chat history and student ID
      console.log("Submitting with sessionId:", sessionId);

      // Sanitize answers before sending
      const sanitizedAnswers = answers.map((answer) => ({
        ...answer,
        text: answer.text?.replace(/\u0000/g, "") || "", // Remove null characters
      }));

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers: sanitizedAnswers,
          examId: exam.id,
          sessionId: sessionId, // 세션 ID 추가
          chatHistory: chatMessages,
          studentId: user?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("Submission successful:", data);
        setFeedback(data.feedback);
        setIsSubmitted(true);

        // 바로 채팅 모드로 전환
        setTimeout(() => {
          startChatMode();
        }, 1000); // 1초 후에 자동으로 채팅 모드 시작
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Submission failed:", errorData);
        alert("답안 제출에 실패했습니다. 다시 시도해주세요.");
      }
    } catch (error) {
      console.error("Error submitting answers:", error);
      alert("답안 제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-lg">시험 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-destructive">오류 발생</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()}>다시 시도</Button>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">시험을 찾을 수 없습니다</h2>
          <p className="text-muted-foreground">시험 코드를 확인해주세요.</p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    // 채팅 모드가 아닐 때는 기존의 성공 메시지 표시
    if (!isChatMode) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* Progress Bar */}
          <div className="bg-background border-b shadow-sm">
            <ProgressBar currentStep="answer" />
          </div>
          <div className="container mx-auto px-4 py-16">
            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-green-600">
                  답안이 성공적으로 제출되었습니다!
                </CardTitle>
                <CardDescription>
                  이제 AI 피드백 테스트를 시작할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">
                    AI가 답안을 분석하여 피드백을 제공합니다.
                    <br />
                    질문을 통해 더 깊이 있는 학습을 할 수 있습니다.
                  </p>
                  <Button
                    onClick={startChatMode}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Feedback 테스트
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    // 채팅 모드일 때는 Resizable 레이아웃 표시
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
                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  피드백 중
                </div>
              </div>

              {/* Center: Progress Steps */}
              <div className="flex justify-center">
                <ProgressBar currentStep="feedback" />
              </div>

              {/* Right: Profile Image */}
              <div className="flex items-center justify-end space-x-3">
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
            {/* Left Side - Feedback Content */}
            <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
              <div className="bg-background border-r flex flex-col h-full overflow-y-auto">
                <div className="p-6 space-y-6">
                  <div>
                    <div className="mb-4">
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        AI 피드백
                      </div>
                    </div>

                    {/* Feedback Content */}
                    {feedback ? (
                      <div className="bg-muted/50 p-6 rounded-lg">
                        <h3 className="font-semibold mb-4 text-lg">
                          답안에 대한 피드백
                        </h3>
                        <AIMessageRenderer
                          content={feedback}
                          timestamp={new Date().toISOString()}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-12">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                          <MessageCircle className="w-8 h-8 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          피드백을 불러오는 중입니다...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ResizablePanel>

            {/* Resizable Handle */}
            <ResizableHandle withHandle />

            {/* Right Side - Reply Input */}
            <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
              <div className="bg-background flex flex-col h-full">
                {/* Response Area */}
                <div className="flex-1 overflow-y-auto p-6">
                  {conversationEnded ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <svg
                          className="w-8 h-8 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <p className="text-xl font-semibold text-green-700 dark:text-green-300">
                        수고하셨습니다! 🎉
                      </p>
                      <p className="text-sm text-muted-foreground">
                        시험이 완료되었습니다.
                      </p>
                      <Button
                        onClick={() => (window.location.href = "/student")}
                        className="bg-green-600 hover:bg-green-700 px-6 py-2"
                      >
                        시험 종료하기
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-base font-semibold">
                          피드백에 대한 답변
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                          AI 피드백을 읽고 자유롭게 답변하세요.
                        </p>
                      </div>

                      <Textarea
                        placeholder="피드백에 대한 답변을 작성하세요..."
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        className="min-h-[400px] text-base"
                        disabled={isTyping}
                      />

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {chatMessage.length} 글자
                        </p>
                        <Button
                          onClick={sendChatMessage}
                          disabled={isTyping || !chatMessage.trim()}
                          size="lg"
                          className="px-8"
                        >
                          {isTyping ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                              처리 중...
                            </>
                          ) : (
                            "제출하기"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
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
              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                답안 작성
              </div>
            </div>

            {/* Center: Progress Steps */}
            <div className="flex justify-center">
              <ProgressBar currentStep="answer" />
            </div>

            {/* Right: Profile Image */}
            <div className="flex items-center justify-end space-x-3">
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
          {/* Left Side - Problem & Chat History */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background border-r flex flex-col h-full overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Problem Section */}
                <div>
                  <h2 className="text-xl font-bold mb-4">시험 문제</h2>

                  {/* Question Number Badge */}
                  <div className="mb-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      문제 {currentQuestion + 1}
                    </span>
                    <Badge variant="outline" className="ml-2">
                      {exam.questions[currentQuestion]?.points}점
                    </Badge>
                  </div>

                  {/* Exam Info */}
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {exam.questions[currentQuestion]?.type === "essay"
                        ? "서술형"
                        : exam.questions[currentQuestion]?.type ===
                          "short-answer"
                        ? "단답형"
                        : exam.questions[currentQuestion]?.type ===
                          "multiple-choice"
                        ? "객관식"
                        : "문제"}
                    </div>
                  </div>

                  {/* Question Content */}
                  <div className="bg-muted/50 p-4 rounded-lg mb-6">
                    <h3 className="font-semibold mb-2">문제</h3>
                    <p className="text-base leading-relaxed">
                      {exam.questions[currentQuestion]?.text}
                    </p>
                  </div>
                </div>

                {/* Chat History Section */}
                {loadedChatHistory.length > 0 && (
                  <div className="border-t pt-6">
                    <div className="mb-4">
                      <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                        AI와 나눈 대화
                      </div>
                    </div>

                    <div className="space-y-4">
                      {loadedChatHistory.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex ${
                            msg.type === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          {msg.type === "user" ? (
                            <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[80%]">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.message}
                              </p>
                              <p className="text-xs mt-2 opacity-70">
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
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-6 border-t">
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
                    onClick={() =>
                      setCurrentQuestion((prev) =>
                        Math.min(exam.questions.length - 1, prev + 1)
                      )
                    }
                    disabled={currentQuestion === exam.questions.length - 1}
                  >
                    다음 문제 →
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle />

          {/* Right Side - Answer Writing */}
          <ResizablePanel defaultSize={50} minSize={30} maxSize={70}>
            <div className="bg-background flex flex-col h-full">
              {/* Answer Writing Area */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Answer Textarea */}
                <div className="space-y-4 mb-12">
                  <Label className="text-base font-semibold">최종 답안</Label>
                  <Textarea
                    placeholder="여기에 상세한 답안을 작성하세요..."
                    value={answers[currentQuestion]?.text || ""}
                    onChange={(e) =>
                      updateAnswer(
                        exam.questions[currentQuestion].id,
                        e.target.value
                      )
                    }
                    className="min-h-[400px] text-base"
                  />
                </div>

                {/* Submit Card */}
                <Card className="border-2 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-base">시험 제출</CardTitle>
                    <CardDescription>
                      제출하기 전에 답안을 검토하세요
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={handleSubmit}
                      disabled={
                        isSubmitting || answers.some((a) => !a.text.trim())
                      }
                      className="w-full"
                      size="lg"
                    >
                      {isSubmitting ? "제출 중..." : "시험 제출"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      이 작업은 되돌릴 수 없습니다
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
