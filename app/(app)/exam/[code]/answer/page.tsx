"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { z } from "zod";
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
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { AnswerTextarea } from "@/components/ui/answer-textarea";
import { Label } from "@/components/ui/label";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { MessageCircle, ArrowLeft, Save } from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { ExamHeader } from "@/components/ExamHeader";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { Kbd } from "@/components/ui/kbd";
import {
  SubmissionOverlay,
} from "@/components/exam/ExamLoading";
import { useAutoSave } from "@/hooks/useAutoSave";

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

// P1-1: Zod schema for chatHistory URL parameter validation
const chatHistoryMessageSchema = z.object({
  type: z.enum(["user", "assistant"]),
  message: z.string().max(50000),
  timestamp: z.string(),
});
const chatHistorySchema = z.array(chatHistoryMessageSchema).max(200);

/** Strip HTML tags to prevent XSS when rendering chat history from URL params */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

export default function AnswerSubmission() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useUser();

  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [startQuestion, setStartQuestion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedChatHistory, setLoadedChatHistory] = useState<
    Array<{ type: "user" | "assistant"; message: string; timestamp: string }>
  >([]);

  // Fix 1C: Use useAutoSave hook instead of inline auto-save logic
  const autoSave = useAutoSave({
    sessionId,
    examExists: !!exam,
    intervalMs: 30000,
    localStorageKey: `exam_answers_${examCode}`,
  });
  // saveError is handled by toast notifications inside useAutoSave
  const { draftAnswers: answers, setDraftAnswers: setAnswers, isSaving, lastSaved, manualSave, updateAnswer: autoSaveUpdateAnswer } = autoSave;

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

  // Load saved answers from server when session is available
  useEffect(() => {
    const loadSavedAnswersFromServer = async () => {
      if (!sessionId || !exam) return;

      try {
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

          if (result.submissions && result.submissions.length > 0) {
            // Convert server submissions to answers format
            const serverAnswers = exam.questions.map((question, index) => {
              const submission = result.submissions.find(
                (sub: { q_idx: number; answer: string }) => sub.q_idx === index
              );
              return {
                questionId: question.id,
                text: submission?.answer || "",
              };
            });

            setAnswers(serverAnswers);
            // localStorage backup is auto-handled by useAutoSave hook
          }
        }
      } catch {
        // Server load failure is non-critical; localStorage backup exists
      }
    };

    loadSavedAnswersFromServer();
  }, [sessionId, exam, examCode, setAnswers]);

  // Handle startQuestion and chatHistory parameters from URL
  useEffect(() => {
    const startQuestionParam = searchParams.get("startQuestion");
    const chatHistoryParam = searchParams.get("chatHistory");

    if (startQuestionParam) {
      const questionIndex = parseInt(startQuestionParam, 10);

      if (!isNaN(questionIndex) && questionIndex >= 0) {
        setStartQuestion(questionIndex);
        setCurrentQuestion(questionIndex);
      }
    }

    // P1-1: Load chat history from URL params with Zod validation + sanitization
    if (chatHistoryParam) {
      try {
        const rawParsed = JSON.parse(
          decodeURIComponent(chatHistoryParam)
        );

        const validated = chatHistorySchema.safeParse(rawParsed);
        if (validated.success) {
          // Sanitize message content to prevent XSS via URL manipulation
          const sanitized = validated.data.map((msg) => ({
            ...msg,
            message: stripHtmlTags(msg.message),
          }));
          setLoadedChatHistory(sanitized);
        }
        // Invalid shape is silently dropped (non-critical)
      } catch {
        // Chat history parse failure is non-critical
      }
    }
  }, [searchParams]);

  // Get or create session for this exam
  const getOrCreateSession = useCallback(
    async (examId: string) => {
      if (!user) {
        return;
      }

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

          if (result.session) {
            setSessionId(result.session.id);

            // Load existing chat history from session if not already loaded from URL
            if (
              result.messages &&
              result.messages.length > 0 &&
              loadedChatHistory.length === 0
            ) {
              setLoadedChatHistory(result.messages);
            }
          }
        }
      } catch {
        // Session creation failure handled by sessionId remaining null
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

          if (result.exam) {
            setExam(result.exam);

            // Initialize answers array with actual questions
            const initialAnswers = result.exam.questions.map((q: Question) => ({
              questionId: q.id,
              text: "",
            }));
            setAnswers(initialAnswers);

            // Get or create session for this exam
            await getOrCreateSession(result.exam.id);
          } else {
            setError("시험을 찾을 수 없습니다. 시험 코드를 확인해주세요.");
          }
        } else {
          setError("시험 데이터를 불러오는 중 오류가 발생했습니다.");
        }
      } catch {
        setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExamAndSession();
  }, [examCode, user, getOrCreateSession]);

  const updateAnswer = autoSaveUpdateAnswer;

  // Handle back to chat page
  const handleBackToChat = async () => {
    // Save current answers before going back
    await manualSave();

    // Navigate back to chat page with current question
    router.push(`/exam/${examCode}?startQuestion=${currentQuestion}`);
  };

  // Helper function to check if HTML content is empty
  const isHtmlEmpty = (html: string): boolean => {
    if (!html) return true;
    // Remove HTML tags and check if there's any actual content
    const textContent = html.replace(/<[^>]*>/g, "").trim();
    return textContent.length === 0;
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

      // Log to server
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

  const handleSubmit = async () => {
    if (!exam) return;

    // Check if all questions have answers
    const unansweredQuestions = answers.filter((answer) =>
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
          sessionId: sessionId,
          studentId: user?.id,
        }),
      });

      if (response.ok) {
        setIsSubmitted(true);
      } else if (response.status === 409) {
        // 이미 제출된 경우 성공으로 처리
        setIsSubmitted(true);
      } else {
        // 제출 실패 시 서버에서 실제 제출 상태 확인
        try {
          const checkResponse = await fetch("/api/student/sessions");
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            const submittedSession = checkData.sessions?.find(
              (s: { examCode: string; submittedAt: string | null }) =>
                s.examCode === examCode && s.submittedAt !== null
            );
            if (submittedSession) {
              // 실제로는 제출 완료됨
              setIsSubmitted(true);
              return;
            }
          }
        } catch {
          // 상태 확인 실패는 무시
        }
        alert("답안 제출에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      // 네트워크 오류 시에도 서버 상태 확인
      try {
        const checkResponse = await fetch("/api/student/sessions");
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          const submittedSession = checkData.sessions?.find(
            (s: { examCode: string; submittedAt: string | null }) =>
              s.examCode === examCode && s.submittedAt !== null
          );
          if (submittedSession) {
            setIsSubmitted(true);
            return;
          }
        }
      } catch {
        // 상태 확인도 실패
      }
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
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* Header */}
        <ExamHeader
          examCode={examCode}
          duration={exam?.duration ?? 60}
          currentStep="answer"
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
        currentStep="answer"
        user={user}
      />

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
                    <CopyProtector>
                      <RichTextViewer
                        content={exam.questions[currentQuestion]?.text || ""}
                        className="text-base leading-relaxed"
                      />
                    </CopyProtector>
                  </div>
                </div>

                {/* Chat History Section */}
                <div className="border-t pt-6">
                  <div className="mb-4">
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                      AI와 나눈 대화
                    </div>
                  </div>

                  {loadedChatHistory.length > 0 ? (
                    <CopyProtector>
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
                    </CopyProtector>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                        <MessageCircle className="w-6 h-6 text-purple-600" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        아직 AI와 나눈 대화가 없습니다.
                        <br />
                        채팅 페이지에서 AI와 대화를 시작해보세요.
                      </p>
                    </div>
                  )}
                </div>

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
                {/* Back Button and Save Status */}
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="outline"
                    onClick={handleBackToChat}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    채팅으로 돌아가기
                  </Button>

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
                          • {saveShortcut}로 수동 저장
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Save className="w-3 h-3" />
                        <span>자동 저장 활성화</span>
                        <span className="text-xs flex items-center gap-1">
                          • {saveShortcut}로 수동 저장
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Answer Editor */}
                <div className="space-y-4 mb-12">
                  <Label className="text-base font-semibold">최종 답안</Label>
                  <AnswerTextarea
                    placeholder="여기에 상세한 답안을 작성하세요..."
                    value={answers[currentQuestion]?.text || ""}
                    onChange={(value) =>
                      updateAnswer(exam.questions[currentQuestion].id, value)
                    }
                    onPaste={handlePaste}
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
                        isSubmitting || answers.some((a) => isHtmlEmpty(a.text))
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
