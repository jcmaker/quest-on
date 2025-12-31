"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GradeHeader } from "@/components/instructor/GradeHeader";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { GradingPanel } from "@/components/instructor/GradingPanel";
import { QuickActionsCard } from "@/components/instructor/QuickActionsCard";
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import {
  AIOverallSummary,
  SummaryData,
} from "@/components/instructor/AIOverallSummary";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { InstructorChatSidebar } from "@/components/instructor/InstructorChatSidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Clock,
  MessageSquare,
  FileText,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
  message_type?: "concept" | "calculation" | "strategy" | "other";
}

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
  ai_context?: string;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
  decompressed?: {
    answerData?: Record<string, unknown>;
    feedbackData?: Record<string, unknown>;
  };
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
  stage_grading?: {
    chat?: { score: number; comment: string };
    answer?: { score: number; comment: string };
    feedback?: { score: number; comment: string };
  };
}

type StageKey = "chat" | "answer" | "feedback";

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  pasted_text?: string;
  paste_start?: number;
  paste_end?: number;
  answer_length_before?: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface SessionData {
  session: {
    id: string;
    exam_id: string;
    student_id: string;
    submitted_at: string;
    used_clarifications: number;
    created_at: string;
    ai_summary?: SummaryData;
  };
  exam: {
    id: string;
    title: string;
    code: string;
    questions: Question[];
  };
  student: {
    name: string;
    email: string;
    student_number?: string;
    school?: string;
  };
  submissions: Record<string, Submission>;
  messages: Record<string, Conversation[]>;
  grades: Record<string, Grade>;
  pasteLogs?: Record<string, PasteLog[]>; // question_id별로 그룹화된 paste 로그
  overallScore: number | null;
}

export default function GradeStudentPage({
  params,
}: {
  params: Promise<{ examId: string; studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user } = useUser();
  const queryClient = useQueryClient();

  const [scores, setScores] = useState<Record<number, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
  const [stageScores, setStageScores] = useState<
    Record<number, Partial<Record<StageKey, number>>>
  >({});
  const [stageComments, setStageComments] = useState<
    Record<number, Partial<Record<StageKey, string>>>
  >({});
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number>(0);
  const [examStatsOpen, setExamStatsOpen] = useState<boolean>(true);

  // Use state for summary to combine DB data and fresh generation
  const [overallSummary, setOverallSummary] = useState<SummaryData | null>(
    null
  );

  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  // Query for session data
  const { data: sessionData, isLoading: loading } = useQuery({
    queryKey: qk.session.grade(resolvedParams.studentId),
    queryFn: async ({ signal }) => {
      // studentId is actually sessionId in the URL
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        { signal } // AbortSignal 연결
      );

      if (!response.ok) {
        throw new Error("Failed to fetch session data");
      }

      const data: SessionData = await response.json();

      // Debug logging
      console.log("📊 Fetched session data:", data);

      return data;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      (user?.unsafeMetadata?.role as string) === "instructor"
    ),
  });

  // Effect to initialize state from sessionData
  useEffect(() => {
    if (sessionData) {
      setOverallSummary(sessionData.session.ai_summary || null);

      // Initialize scores and feedbacks from existing grades
      const initialScores: Record<number, number> = {};
      const initialFeedbacks: Record<number, string> = {};
      const initialStageScores: Record<
        number,
        Partial<Record<StageKey, number>>
      > = {};
      const initialStageComments: Record<
        number,
        Partial<Record<StageKey, string>>
      > = {};

      Object.entries(sessionData.grades).forEach(([qIdx, grade]) => {
        const typedGrade = grade as Grade;
        initialScores[parseInt(qIdx)] = typedGrade.score;
        initialFeedbacks[parseInt(qIdx)] = typedGrade.comment || "";

        // Load stage grading data
        if (typedGrade.stage_grading) {
          const stageGrading = typedGrade.stage_grading;
          if (stageGrading.chat) {
            initialStageScores[parseInt(qIdx)] = {
              ...initialStageScores[parseInt(qIdx)],
              chat: stageGrading.chat.score,
            };
            initialStageComments[parseInt(qIdx)] = {
              ...initialStageComments[parseInt(qIdx)],
              chat: stageGrading.chat.comment,
            };
          }
          if (stageGrading.answer) {
            initialStageScores[parseInt(qIdx)] = {
              ...initialStageScores[parseInt(qIdx)],
              answer: stageGrading.answer.score,
            };
            initialStageComments[parseInt(qIdx)] = {
              ...initialStageComments[parseInt(qIdx)],
              answer: stageGrading.answer.comment,
            };
          }
          if (stageGrading.feedback) {
            initialStageScores[parseInt(qIdx)] = {
              ...initialStageScores[parseInt(qIdx)],
              feedback: stageGrading.feedback.score,
            };
            initialStageComments[parseInt(qIdx)] = {
              ...initialStageComments[parseInt(qIdx)],
              feedback: stageGrading.feedback.comment,
            };
          }
        }
      });

      setScores(initialScores);
      setFeedbacks(initialFeedbacks);
      setStageScores(initialStageScores);
      setStageComments(initialStageComments);
    }
  }, [sessionData]);

  // Query for AI Summary (optimizing GPT API call)
  const { data: generatedSummary, isLoading: summaryLoading } = useQuery({
    queryKey: qk.session.summary(sessionData?.session?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/generate-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionData?.session?.id,
        }),
        signal, // AbortSignal 연결
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const data = await response.json();
      return data.summary as SummaryData;
    },
    // Only fetch if session loaded AND no summary in DB
    enabled: !!sessionData?.session?.id && !sessionData?.session?.ai_summary,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Effect to update summary when generated
  useEffect(() => {
    if (generatedSummary) {
      setOverallSummary(generatedSummary);
    }
  }, [generatedSummary]);

  // Mutation for saving grades
  const saveGradeMutation = useMutation({
    mutationFn: async (questionIdx: number) => {
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionIdx,
            score: scores[questionIdx] || 0,
            comment: feedbacks[questionIdx] || "",
            stageGrading: {
              chat: stageScores[questionIdx]?.chat
                ? {
                    score: stageScores[questionIdx]?.chat || 0,
                    comment: stageComments[questionIdx]?.chat || "",
                  }
                : undefined,
              answer: stageScores[questionIdx]?.answer
                ? {
                    score: stageScores[questionIdx]?.answer || 0,
                    comment: stageComments[questionIdx]?.answer || "",
                  }
                : undefined,
              feedback: stageScores[questionIdx]?.feedback
                ? {
                    score: stageScores[questionIdx]?.feedback || 0,
                    comment: stageComments[questionIdx]?.feedback || "",
                  }
                : undefined,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = extractErrorMessage(
          errorData,
          "채점 저장 중 오류가 발생했습니다",
          response.status
        );
        throw new Error(errorMessage);
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate to refresh overall score
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.studentId),
      });
      toast.success("채점이 저장되었습니다.");
    },
    onError: (error: Error) => {
      console.error("Error saving grade:", error);
      const errorMessage = getErrorMessage(
        error,
        "채점 저장 중 오류가 발생했습니다"
      );
      toast.error(errorMessage, {
        duration: 5000, // 에러 메시지가 길 수 있으므로 더 길게 표시
      });
    },
  });

  const handleSaveGrade = (questionIdx: number) => {
    saveGradeMutation.mutate(questionIdx);
  };

  const handleStageScoreChange = (stage: StageKey, value: number) => {
    setStageScores((prev) => ({
      ...prev,
      [selectedQuestionIdx]: {
        ...(prev[selectedQuestionIdx] || {}),
        [stage]: value,
      },
    }));
  };

  const handleStageCommentChange = (stage: StageKey, value: string) => {
    setStageComments((prev) => ({
      ...prev,
      [selectedQuestionIdx]: {
        ...(prev[selectedQuestionIdx] || {}),
        [stage]: value,
      },
    }));
  };

  // Compute chat context (must be before conditional returns to follow Rules of Hooks)
  const chatContext = useMemo(() => {
    if (!sessionData) return "";
    const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
    const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
      | Submission
      | undefined;
    return [
      `시험 제목: ${sessionData.exam.title}`,
      `시험 코드: ${sessionData.exam.code}`,
      `선택된 문항 번호: ${selectedQuestionIdx + 1}`,
      currentQuestion
        ? `문항 프롬프트: ${currentQuestion.prompt}`
        : "현재 문항 정보를 찾을 수 없습니다.",
      currentSubmission?.answer
        ? `학생 답안:\n${currentSubmission.answer}`
        : "학생 답안이 비어 있습니다.",
      sessionData.overallScore !== null
        ? `현재 전체 점수: ${sessionData.overallScore}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [sessionData, selectedQuestionIdx]);

  // Calculate exam participation statistics
  const examStats = useMemo(() => {
    if (!sessionData) return null;

    const { session, submissions, messages, exam } = sessionData;

    // 시험 소요 시간 계산 (분 단위)
    const examDuration =
      session.submitted_at && session.created_at
        ? Math.round(
            (new Date(session.submitted_at).getTime() -
              new Date(session.created_at).getTime()) /
              60000
          )
        : null;

    // 전체 질문 갯수 (used_clarifications 또는 messages의 총 개수)
    const totalQuestions = session.used_clarifications || 0;
    const totalMessages = Object.values(messages).reduce(
      (sum, msgs) => sum + (msgs?.length || 0),
      0
    );
    const questionCount = totalQuestions || totalMessages;

    // 답안 길이 계산
    let totalAnswerLength = 0;
    let answerCount = 0;
    const answerLengthsByQuestion: Record<number, number> = {};

    Object.entries(submissions).forEach(([qIdx, submission]) => {
      const typedSubmission = submission as Submission;
      const answer = typedSubmission.answer || "";
      const length = answer.length;
      totalAnswerLength += length;
      answerCount++;
      answerLengthsByQuestion[parseInt(qIdx)] = length;
    });

    const averageAnswerLength =
      answerCount > 0 ? Math.round(totalAnswerLength / answerCount) : 0;

    // 학생이 AI에게 한 질문 유형 분포 (messages에서 user role의 message_type 분석)
    const questionTypeCount: Record<string, number> = {
      concept: 0,
      calculation: 0,
      strategy: 0,
      other: 0,
    };

    Object.values(messages).forEach((msgs) => {
      if (Array.isArray(msgs)) {
        msgs.forEach((msg) => {
          if (msg.role === "user" && msg.message_type) {
            const type = msg.message_type;
            if (
              type === "concept" ||
              type === "calculation" ||
              type === "strategy" ||
              type === "other"
            ) {
              questionTypeCount[type] = (questionTypeCount[type] || 0) + 1;
            }
          }
        });
      }
    });

    // 문항별 질문 수
    const questionsByQuestion: Record<number, number> = {};
    Object.entries(messages).forEach(([qIdx, msgs]) => {
      const idx = parseInt(qIdx);
      if (!isNaN(idx)) {
        questionsByQuestion[idx] = (msgs?.length || 0) / 2; // user와 ai 메시지 쌍
      }
    });

    // 부정 행위 의심 통계 (전체 문항)
    let totalPasteLogs = 0;
    let suspiciousPasteLogs = 0;
    const pasteLogsByQuestion: Record<
      number,
      { total: number; suspicious: number }
    > = {};

    if (sessionData.pasteLogs) {
      Object.entries(sessionData.pasteLogs).forEach(([qIdOrIdx, logs]) => {
        if (!Array.isArray(logs)) return;

        const logsArray = logs as PasteLog[];
        const questionIdx =
          exam.questions?.findIndex((q) => q.id === qIdOrIdx) ??
          parseInt(qIdOrIdx);

        if (!isNaN(questionIdx) && questionIdx >= 0) {
          const total = logsArray.length;
          const suspicious = logsArray.filter((log) => log.suspicious).length;

          totalPasteLogs += total;
          suspiciousPasteLogs += suspicious;
          pasteLogsByQuestion[questionIdx] = { total, suspicious };
        }
      });
    }

    return {
      examDuration,
      questionCount,
      totalAnswerLength,
      averageAnswerLength,
      answerLengthsByQuestion,
      questionTypeCount,
      questionsByQuestion,
      startTime: session.created_at,
      submittedTime: session.submitted_at,
      totalPasteLogs,
      suspiciousPasteLogs,
      pasteLogsByQuestion,
    };
  }, [sessionData]);

  // Show loading while auth is loading
  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Don't render anything if not authorized
  if (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor") {
    return null;
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            제출물을 찾을 수 없습니다
          </h2>
          <Link href={`/instructor/${resolvedParams.examId}`}>
            <Button variant="outline">돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get current question data
  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
    | Submission
    | undefined;

  // Try to get messages by both index and question.id (for backward compatibility)
  let currentMessages = (sessionData.messages?.[selectedQuestionIdx] ||
    []) as Conversation[];

  // If no messages found by index, try using question.id
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] ||
      []) as Conversation[];
  }

  // Separate messages into AI conversations (before submission) and feedback conversations (after submission)
  const aiConversations = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

  // For now, we'll assume all messages are AI conversations during the exam
  const duringExamMessages = aiConversations;

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <InstructorChatSidebar
        context={chatContext}
        sessionIdSeed={`grade_${sessionData.session.id}`}
        scopeDescription="문항/답안/채점 데이터"
        title="채점 도우미"
        subtitle="이 화면에 보이는 데이터 범위 안에서만 답변합니다."
      />
      <SidebarInset>
        <div className="container mx-auto p-6 max-w-7xl">
          <div className="mb-8">
            <GradeHeader
              studentName={sessionData.student.name}
              submittedAt={sessionData.session.submitted_at}
              overallScore={sessionData.overallScore}
              examId={resolvedParams.examId}
              studentNumber={sessionData.student.student_number}
              school={sessionData.student.school}
            />
          </div>

          {/* 데이터 표시 */}
          {examStats && (
            <div className="mb-6">
              <Collapsible open={examStatsOpen} onOpenChange={setExamStatsOpen}>
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5" />
                          <CardTitle>시험 응시 데이터</CardTitle>
                        </div>
                        {examStatsOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <CardDescription>
                        학생의 시험 응시 과정에서 수집된 데이터입니다
                      </CardDescription>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <div className="grid gap-6 md:grid-cols-3">
                        {/* 시험 소요 시간 */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>시험 소요 시간</span>
                          </div>
                          <div className="text-2xl font-semibold">
                            {examStats.examDuration !== null
                              ? `${examStats.examDuration}분`
                              : "미제출"}
                          </div>
                          {examStats.startTime && (
                            <div className="text-xs text-muted-foreground">
                              시작:{" "}
                              {new Date(examStats.startTime).toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          )}
                          {examStats.submittedTime && (
                            <div className="text-xs text-muted-foreground">
                              제출:{" "}
                              {new Date(examStats.submittedTime).toLocaleString(
                                "ko-KR"
                              )}
                            </div>
                          )}
                        </div>

                        {/* 질문 갯수 */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                            <span>AI 질문 수</span>
                          </div>
                          <div className="text-2xl font-semibold">
                            {examStats.questionCount}개
                          </div>
                          <div className="text-xs text-muted-foreground">
                            평균:{" "}
                            {sessionData.exam.questions.length > 0
                              ? Math.round(
                                  examStats.questionCount /
                                    sessionData.exam.questions.length
                                )
                              : 0}
                            개/문항
                          </div>
                        </div>

                        {/* 답안 길이 */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            <span>답안 길이</span>
                          </div>
                          <div className="text-2xl font-semibold">
                            {examStats.totalAnswerLength.toLocaleString()}자
                          </div>
                          <div className="text-xs text-muted-foreground">
                            평균:{" "}
                            {examStats.averageAnswerLength.toLocaleString()}자
                          </div>
                        </div>
                      </div>

                      {/* 질문 유형 분포 */}
                      {Object.values(examStats.questionTypeCount).some(
                        (count) => count > 0
                      ) && (
                        <div className="mt-6 pt-6 border-t">
                          <h4 className="text-sm font-semibold mb-3">
                            질문 유형 분포
                          </h4>
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(examStats.questionTypeCount)
                              .filter(([_, count]) => count > 0)
                              .map(([type, count]) => (
                                <div
                                  key={type}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted"
                                >
                                  <span className="text-sm font-medium">
                                    {type === "concept"
                                      ? "개념 질문"
                                      : type === "calculation"
                                      ? "계산 질문"
                                      : type === "strategy"
                                      ? "전략 질문"
                                      : "기타"}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {count}개
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* 부정 행위 의심 통계 */}
                      {examStats.totalPasteLogs > 0 && (
                        <div className="mt-6 pt-6 border-t">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            {examStats.suspiciousPasteLogs > 0 ? (
                              <>
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <span className="text-red-800">
                                  부정행위 의심
                                </span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 text-orange-600" />
                                <span>붙여넣기 활동</span>
                              </>
                            )}
                          </h4>
                          <div
                            className={`p-4 rounded-lg border ${
                              examStats.suspiciousPasteLogs > 0
                                ? "bg-red-50 border-red-200"
                                : "bg-orange-50 border-orange-200"
                            }`}
                          >
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                  전체 붙여넣기:
                                </span>
                                <Badge variant="outline" className="text-sm">
                                  {examStats.totalPasteLogs}회
                                </Badge>
                              </div>
                              {examStats.suspiciousPasteLogs > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-red-800">
                                    외부 복사-붙여넣기:
                                  </span>
                                  <Badge
                                    variant="destructive"
                                    className="text-sm"
                                  >
                                    {examStats.suspiciousPasteLogs}회
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 문항별 상세 정보 */}
                      {sessionData.exam.questions.length > 0 && (
                        <div className="mt-6 pt-6 border-t">
                          <h4 className="text-sm font-semibold mb-3">
                            문항별 상세 정보
                          </h4>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {sessionData.exam.questions.map((q, idx) => {
                              const answerLength =
                                examStats.answerLengthsByQuestion[idx] || 0;
                              const questionCount =
                                examStats.questionsByQuestion[idx] || 0;
                              const pasteLogs =
                                examStats.pasteLogsByQuestion[idx];
                              const hasAnswer = answerLength > 0;

                              return (
                                <div
                                  key={q.id}
                                  className="p-3 rounded-lg border bg-muted/30"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">
                                      {idx + 1}번 문항
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        답안 길이:
                                      </span>
                                      <span className="font-medium">
                                        {hasAnswer
                                          ? `${answerLength.toLocaleString()}자`
                                          : "미제출"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        질문 수:
                                      </span>
                                      <span className="font-medium">
                                        {questionCount}개
                                      </span>
                                    </div>
                                    {pasteLogs && pasteLogs.total > 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                          붙여넣기:
                                        </span>
                                        <span className="font-medium">
                                          {pasteLogs.total}회
                                          {pasteLogs.suspicious > 0 && (
                                            <span className="text-red-600 ml-1">
                                              (의심 {pasteLogs.suspicious}회)
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          )}

          <div className="mb-6">
            <AIOverallSummary
              summary={overallSummary}
              loading={summaryLoading}
            />
          </div>

          <QuestionNavigation
            questions={sessionData.exam?.questions || []}
            selectedQuestionIdx={selectedQuestionIdx}
            onSelectQuestion={setSelectedQuestionIdx}
            grades={sessionData.grades}
          />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <QuestionPromptCard
                question={currentQuestion}
                questionNumber={selectedQuestionIdx + 1}
              />

              <AIConversationsCard messages={duringExamMessages} />

              <FinalAnswerCard
                submission={currentSubmission}
                pasteLogs={
                  currentQuestion
                    ? sessionData.pasteLogs?.[currentQuestion.id] ||
                      sessionData.pasteLogs?.[String(selectedQuestionIdx)]
                    : undefined
                }
                questionId={currentQuestion?.id}
              />
            </div>

            <div className="space-y-6">
              <GradingPanel
                questionNumber={selectedQuestionIdx + 1}
                stageScores={stageScores[selectedQuestionIdx] || {}}
                stageComments={stageComments[selectedQuestionIdx] || {}}
                overallScore={scores[selectedQuestionIdx] || 0}
                overallFeedback={feedbacks[selectedQuestionIdx] || ""}
                isGraded={!!sessionData.grades[selectedQuestionIdx]}
                saving={saveGradeMutation.isPending}
                onStageScoreChange={handleStageScoreChange}
                onStageCommentChange={handleStageCommentChange}
                onOverallScoreChange={(value) =>
                  setScores({
                    ...scores,
                    [selectedQuestionIdx]: value,
                  })
                }
                onOverallFeedbackChange={(value) =>
                  setFeedbacks({
                    ...feedbacks,
                    [selectedQuestionIdx]: value,
                  })
                }
                onSave={() => handleSaveGrade(selectedQuestionIdx)}
              />

              <QuickActionsCard
                sessionId={sessionData.session.id}
                isGraded={
                  Object.keys(sessionData.grades || {}).length > 0 &&
                  sessionData.overallScore !== null
                }
                reportData={
                  sessionData
                    ? {
                        exam: {
                          title: sessionData.exam.title,
                          code: sessionData.exam.code,
                          questions: sessionData.exam.questions.map(
                            (q: Question) => ({
                              id: q.id,
                              idx: q.idx,
                              type: q.type,
                              prompt: q.prompt,
                            })
                          ),
                          description: undefined, // Not available in SessionData
                        },
                        session: {
                          submitted_at: sessionData.session.submitted_at,
                        },
                        grades: Object.fromEntries(
                          Object.entries(sessionData.grades).map(
                            ([key, grade]) => {
                              const typedGrade = grade as Grade;
                              return [
                                parseInt(key),
                                {
                                  id: typedGrade.id,
                                  q_idx: typedGrade.q_idx,
                                  score: typedGrade.score,
                                  comment: typedGrade.comment,
                                },
                              ];
                            }
                          )
                        ),
                        overallScore: sessionData.overallScore,
                        studentName: sessionData.student.name,
                        aiSummary: undefined, // Can be fetched separately if needed
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
