"use client";

import { useState, useEffect } from "react";
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

import { MessageCircle } from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import ProgressBar from "@/components/ProgressBar";

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

        // Convert chat history format to match the expected format
        const convertedChatHistory = parsedChatHistory.map((msg: Record<string, unknown>) => ({
          type: msg.type === "user" ? "student" : "ai",
          content: msg.message || msg.content,
          timestamp: msg.timestamp,
        }));

        setChatMessages(convertedChatHistory);
      } catch (error) {
        console.error("Error parsing chat history from URL:", error);
      }
    }
  }, [searchParams]);

  // Fetch exam data from database
  useEffect(() => {
    const fetchExam = async () => {
      if (!examCode) {
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

            // TODO: Load draft answers from database
            // This would require a new API endpoint to fetch saved drafts
            console.log("TODO: Load draft answers from previous session");
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

    fetchExam();
  }, [examCode]);

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
    setChatMessage("");

    // 학생 답변 즉시 "수고하셨습니다" 메시지 표시
    setTimeout(() => {
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

    setIsSubmitting(true);

    try {
      // Submit answers to API with chat history and student ID
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers,
          examId: exam.id,
          chatHistory: chatMessages,
          studentId: user?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFeedback(data.feedback);
        setIsSubmitted(true);

        // 바로 채팅 모드로 전환
        setTimeout(() => {
          startChatMode();
        }, 1000); // 1초 후에 자동으로 채팅 모드 시작
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

    // 채팅 모드일 때는 채팅 인터페이스 표시
    return (
      <div className="min-h-screen bg-background">
        {/* Progress Bar */}
        <div className="bg-background border-b shadow-sm">
          <ProgressBar currentStep="feedback" />
        </div>

        {/* Header */}
        <div className="bg-background/95 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{exam.title}</h1>
                <p className="text-muted-foreground">AI 피드백 테스트 중</p>
                {startQuestion > 0 && (
                  <p className="text-sm text-blue-600 mt-1">
                    문제 {startQuestion + 1}번 피드백
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={conversationEnded ? "default" : "secondary"}>
                  {conversationEnded ? "테스트 완료" : "테스트 중"}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="container mx-auto px-6 py-8 max-w-4xl">
          <div className="h-[600px] flex flex-col border rounded-xl bg-background">
            {/* Chat Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    AI 피드백 어시스턴트
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    답안 분석 및 피드백 제공
                  </p>
                </div>
              </div>
              {conversationEnded && (
                <Badge variant="outline" className="text-green-600">
                  피드백 완료
                </Badge>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center shadow-lg">
                      <MessageCircle className="w-8 h-8 text-primary-foreground" />
                    </div>
                  </div>
                  <h4 className="font-semibold text-foreground mb-3 text-lg">
                    AI 피드백 테스트를 시작합니다
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    답안에 대한 AI 피드백을 받을 수 있습니다.
                    <br />
                    궁금한 점이 있으면 언제든 질문해주세요.
                  </p>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.type === "student" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.type === "student" ? (
                        <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[80%] shadow-sm">
                          <p className="text-sm leading-relaxed">
                            {msg.content}
                          </p>
                          <p className="text-xs mt-2 opacity-70">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ) : msg.content === "exam_completed" ? (
                        <div className="bg-muted/80 text-foreground border border-border/50 backdrop-blur-sm rounded-2xl px-6 py-4 max-w-[80%] shadow-sm">
                          <div className="text-center space-y-3">
                            <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                              수고하셨습니다! 🎉
                            </p>
                            <p className="text-sm text-muted-foreground">
                              시험이 완료되었습니다.
                            </p>
                            <Button
                              onClick={() =>
                                (window.location.href = "/student")
                              }
                              className="bg-green-600 hover:bg-green-700 px-6 py-2"
                              size="sm"
                            >
                              시험 종료하기
                            </Button>
                          </div>
                          <p className="text-xs mt-3 opacity-70 text-center">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      ) : (
                        <AIMessageRenderer
                          content={msg.content}
                          timestamp={msg.timestamp}
                        />
                      )}
                    </div>
                  ))}

                  {isLoading && (
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
                            AI가 답변을 작성 중...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Chat Input */}
            {!conversationEnded &&
              !chatMessages.some((msg) => msg.content === "exam_completed") && (
                <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 relative">
                      <textarea
                        placeholder="AI에게 질문하기..."
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                        className="w-full min-h-[44px] max-h-32 resize-none border-2 focus:border-primary/50 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 text-sm"
                        disabled={isLoading}
                        rows={1}
                      />
                    </div>
                    <Button
                      onClick={sendChatMessage}
                      disabled={isLoading || !chatMessage.trim()}
                      className="h-11 px-6 shadow-sm hover:shadow-md"
                    >
                      {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      ) : (
                        "전송"
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      Enter로 전송 • Shift+Enter로 줄바꿈
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{exam.title}</h1>
              <p className="text-muted-foreground">코드: {exam.code}</p>
              {startQuestion > 0 && (
                <p className="text-sm text-blue-600 mt-1">
                  문제 {startQuestion + 1}번부터 시작
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">최종 답안 제출</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Answer Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    문제 {currentQuestion + 1} / {exam.questions.length}
                  </CardTitle>
                  <Badge variant="outline">
                    {exam.questions[currentQuestion]?.points}점
                  </Badge>
                </div>
                <CardDescription>
                  {exam.questions[currentQuestion]?.type === "essay"
                    ? "서술형"
                    : exam.questions[currentQuestion]?.type === "short-answer"
                    ? "단답형"
                    : exam.questions[currentQuestion]?.type ===
                      "multiple-choice"
                    ? "객관식"
                    : exam.questions[currentQuestion]?.type}{" "}
                  문제
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none mb-6">
                  <p className="text-lg leading-relaxed">
                    {exam.questions[currentQuestion]?.text}
                  </p>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-medium">답안</Label>
                  <Textarea
                    placeholder="여기에 상세한 답안을 작성하세요..."
                    value={answers[currentQuestion]?.text || ""}
                    onChange={(e) =>
                      updateAnswer(
                        exam.questions[currentQuestion].id,
                        e.target.value
                      )
                    }
                    className="min-h-[300px]"
                  />
                  <p className="text-sm text-muted-foreground">
                    이해도를 보여주는 포괄적인 답안을 작성하세요.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentQuestion((prev) => Math.max(0, prev - 1))
                }
                disabled={currentQuestion === 0}
              >
                이전 문제
              </Button>
              <Button
                onClick={() =>
                  setCurrentQuestion((prev) =>
                    Math.min(exam.questions.length - 1, prev + 1)
                  )
                }
                disabled={currentQuestion === exam.questions.length - 1}
              >
                다음 문제
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress */}
            <Card>
              <CardHeader>
                <CardTitle>진행 상황</CardTitle>
                <CardDescription>답안 작성 완료 상태</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {exam.questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full ${
                            answers[index]?.text.trim()
                              ? "bg-green-500"
                              : "bg-gray-300"
                          }`}
                        />
                        <span className="text-sm">Q{index + 1}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {question.points}점
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span>완료:</span>
                    <span className="font-medium">
                      {answers.filter((a) => a.text.trim()).length} /{" "}
                      {exam.questions.length}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          (answers.filter((a) => a.text.trim()).length /
                            exam.questions.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Question Navigation */}
            <Card>
              <CardHeader>
                <CardTitle>문제 탐색</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {exam.questions.map((_, index) => (
                    <Button
                      key={index}
                      variant={
                        currentQuestion === index ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setCurrentQuestion(index)}
                      className="h-10 w-10 p-0"
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <Card>
              <CardHeader>
                <CardTitle>시험 제출</CardTitle>
                <CardDescription>
                  제출하기 전에 답안을 검토하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || answers.some((a) => !a.text.trim())}
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
      </div>
    </div>
  );
}
