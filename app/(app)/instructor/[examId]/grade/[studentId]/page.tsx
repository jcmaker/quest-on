"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GradeHeader } from "@/components/instructor/GradeHeader";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { GradingPanel } from "@/components/instructor/GradingPanel";
// import { QuickActionsCard } from "@/components/instructor/QuickActionsCard"; // PDF 기능 임시 숨김
import toast from "react-hot-toast";
import { extractErrorMessage, getErrorMessage } from "@/lib/error-messages";
import {
  AIOverallSummary,
  SummaryData,
} from "@/components/instructor/AIOverallSummary";
import { AiDependencySummaryCard } from "@/components/grading/AiDependencySummaryCard";
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
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
} from "recharts";
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
import { StageGrading, StageKey } from "@/lib/types/grading";
import { isAiGraded } from "@/lib/grading-utils";

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
  decompressed?: {
    answerData?: Record<string, unknown>;
  };
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
  stage_grading?: StageGrading;
}

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
    auto_submitted?: boolean;
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
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, user } = useUser();
  const queryClient = useQueryClient();

  // URL 쿼리 파라미터에서 전체 평균 및 표준편차 데이터 읽기
  const averageStats = useMemo(() => {
    const avgScore = searchParams.get("avgScore");
    const avgQuestions = searchParams.get("avgQuestions");
    const avgAnswerLength = searchParams.get("avgAnswerLength");
    const avgExamDuration = searchParams.get("avgExamDuration");
    const stdDevScore = searchParams.get("stdDevScore");
    const stdDevQuestions = searchParams.get("stdDevQuestions");
    const stdDevAnswerLength = searchParams.get("stdDevAnswerLength");
    const stdDevExamDuration = searchParams.get("stdDevExamDuration");

    return {
      averageScore: avgScore ? parseFloat(avgScore) : null,
      averageQuestions: avgQuestions ? parseFloat(avgQuestions) : null,
      averageAnswerLength: avgAnswerLength ? parseFloat(avgAnswerLength) : null,
      averageExamDuration: avgExamDuration ? parseFloat(avgExamDuration) : null,
      standardDeviationScore: stdDevScore ? parseFloat(stdDevScore) : null,
      standardDeviationQuestions: stdDevQuestions
        ? parseFloat(stdDevQuestions)
        : null,
      standardDeviationAnswerLength: stdDevAnswerLength
        ? parseFloat(stdDevAnswerLength)
        : null,
      standardDeviationExamDuration: stdDevExamDuration
        ? parseFloat(stdDevExamDuration)
        : null,
    };
  }, [searchParams]);

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
  const [showBackConfirm, setShowBackConfirm] = useState<boolean>(false);
  const [acceptedAiScores, setAcceptedAiScores] = useState<
    Record<number, boolean>
  >({}); // 가채점 점수를 승인한 문제들

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
  const { data: sessionData, isLoading: loading, error: sessionError, refetch } = useQuery({
    queryKey: qk.session.grade(resolvedParams.studentId),
    queryFn: async ({ signal }) => {
      // studentId is actually sessionId in the URL
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        { signal } // AbortSignal 연결
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `채점 데이터 로드 실패 (${response.status})`);
      }

      const data: SessionData = await response.json();

      return data;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      (user?.unsafeMetadata?.role as string) === "instructor"
    ),
  });

  // AI 재채점 상태
  const [isRegrading, setIsRegrading] = useState(false);

  // AI 재채점 핸들러
  const handleRegrade = async () => {
    setIsRegrading(true);
    try {
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRegrade: true }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "AI 재채점에 실패했습니다");
      }

      const data = await response.json();
      toast.success(
        data.skipped
          ? "이미 채점이 완료되어 있습니다."
          : `AI 재채점이 완료되었습니다. (${data.gradesCount || 0}개 문제)`
      );

      // 데이터 리프레시
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.studentId),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "AI 재채점 중 오류가 발생했습니다"
      );
    } finally {
      setIsRegrading(false);
    }
  };

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

  // Mutation for saving grades (optimistic update)
  const saveGradeMutation = useMutation({
    mutationFn: async (questionIdx: number) => {
      const existingStageGrading = (
        sessionData?.grades?.[questionIdx] as Grade | undefined
      )?.stage_grading;
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
                    ...(existingStageGrading?.chat || {}),
                    score: stageScores[questionIdx]?.chat || 0,
                    comment: stageComments[questionIdx]?.chat || "",
                  }
                : existingStageGrading?.chat,
              answer: stageScores[questionIdx]?.answer
                ? {
                    ...(existingStageGrading?.answer || {}),
                    score: stageScores[questionIdx]?.answer || 0,
                    comment: stageComments[questionIdx]?.answer || "",
                  }
                : existingStageGrading?.answer,
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
    onMutate: async (questionIdx: number) => {
      // Optimistic update: 서버 확인 전 로컬 캐시에 즉시 반영
      await queryClient.cancelQueries({
        queryKey: qk.session.grade(resolvedParams.studentId),
      });

      const previousData = queryClient.getQueryData(
        qk.session.grade(resolvedParams.studentId)
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(qk.session.grade(resolvedParams.studentId), (old: any) => {
        if (!old) return old;
        const updatedGrades = { ...old.grades };
        const existingGrade = updatedGrades[questionIdx] as Grade | undefined;
        updatedGrades[questionIdx] = {
          ...(existingGrade || { id: "optimistic", q_idx: questionIdx }),
          score: scores[questionIdx] || 0,
          comment: feedbacks[questionIdx] || "",
          stage_grading: {
            ...(existingGrade?.stage_grading || {}),
            ...(stageScores[questionIdx]?.chat ? {
              chat: { ...(existingGrade?.stage_grading?.chat || {}), score: stageScores[questionIdx]?.chat || 0, comment: stageComments[questionIdx]?.chat || "" },
            } : {}),
            ...(stageScores[questionIdx]?.answer ? {
              answer: { ...(existingGrade?.stage_grading?.answer || {}), score: stageScores[questionIdx]?.answer || 0, comment: stageComments[questionIdx]?.answer || "" },
            } : {}),
          },
        };
        return { ...old, grades: updatedGrades };
      });

      return { previousData };
    },
    onSuccess: () => {
      toast.success("채점이 저장되었습니다.");
    },
    onError: (error: Error, _questionIdx, context) => {
      // 실패 시 이전 데이터로 롤백
      if (context?.previousData) {
        queryClient.setQueryData(
          qk.session.grade(resolvedParams.studentId),
          context.previousData
        );
      }
      const errorMessage = getErrorMessage(
        error,
        "채점 저장 중 오류가 발생했습니다"
      );
      toast.error(errorMessage, {
        duration: 5000,
      });
    },
    onSettled: () => {
      // 성공/실패 모두 서버 데이터로 동기화
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.studentId),
      });
    },
  });

  const handleSaveGrade = (questionIdx: number) => {
    // 가채점만 있는 경우 저장 방지
    const currentGrade = sessionData?.grades?.[questionIdx] as
      | Grade
      | undefined;
    if (currentGrade && isAiGraded(currentGrade)) {
      // 교수가 점수를 직접 수정했는지 또는 승인했는지 확인
      const originalScore = currentGrade.score;
      const currentScore = scores[questionIdx] || 0;
      const isAccepted = acceptedAiScores[questionIdx] || false;

      // 점수가 변경되지 않았고 승인도 안 했으면 저장 불가
      if (originalScore === currentScore && !isAccepted) {
        toast.error(
          "가채점 점수를 승인하거나 직접 입력한 후 저장할 수 있습니다.",
          {
            duration: 4000,
          }
        );
        return;
      }
    }
    saveGradeMutation.mutate(questionIdx);
  };

  // 현재 선택된 문제가 가채점만 있는지 확인
  const isCurrentQuestionAiGradedOnly = useMemo(() => {
    if (!sessionData) return false;
    const currentGrade = sessionData.grades?.[selectedQuestionIdx] as
      | Grade
      | undefined;
    if (!currentGrade) return false;

    if (isAiGraded(currentGrade)) {
      // 교수가 점수를 수정했는지 또는 승인했는지 확인
      const originalScore = currentGrade.score;
      const currentScore = scores[selectedQuestionIdx] || 0;
      const isAccepted = acceptedAiScores[selectedQuestionIdx] || false;
      return originalScore === currentScore && !isAccepted;
    }
    return false;
  }, [sessionData, selectedQuestionIdx, scores, acceptedAiScores]);

  // 현재 문제의 가채점 점수
  const currentAiGradedScore = useMemo(() => {
    if (!sessionData) return undefined;
    const currentGrade = sessionData.grades?.[selectedQuestionIdx] as
      | Grade
      | undefined;
    if (!currentGrade || !isAiGraded(currentGrade)) return undefined;
    return currentGrade.score;
  }, [sessionData, selectedQuestionIdx]);

  // 가채점 점수 승인 핸들러
  const handleAcceptAiScore = () => {
    if (currentAiGradedScore !== undefined) {
      setScores({
        ...scores,
        [selectedQuestionIdx]: currentAiGradedScore,
      });
      // 가채점 점수 승인 표시
      setAcceptedAiScores({
        ...acceptedAiScores,
        [selectedQuestionIdx]: true,
      });
      toast.success(
        `가채점 점수 ${currentAiGradedScore}점으로 설정되었습니다. 저장 버튼을 눌러 채점을 완료하세요.`,
        {
          duration: 3000,
        }
      );
    }
  };

  // 뒤로 가기 핸들러
  const handleBackClick = () => {
    // 가채점만 있는 문제가 있는지 확인
    const hasAiGradedOnly = Object.entries(sessionData?.grades || {}).some(
      ([qIdx, grade]) => {
        const typedGrade = grade as Grade;
        if (!isAiGraded(typedGrade)) return false;
        const originalScore = typedGrade.score;
        const currentScore = scores[parseInt(qIdx)] || 0;
        const isAccepted = acceptedAiScores[parseInt(qIdx)] || false;
        return originalScore === currentScore && !isAccepted;
      }
    );

    if (hasAiGradedOnly) {
      setShowBackConfirm(true);
    } else {
      // 가채점만 있는 문제가 없으면 바로 이동
      window.location.href = `/instructor/${resolvedParams.examId}`;
    }
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

  if (sessionError || !sessionData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {sessionError ? "채점 데이터를 불러오는 중 오류가 발생했습니다" : "제출물을 찾을 수 없습니다"}
          </h2>
          {sessionError && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {sessionError.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              다시 시도
            </Button>
            <Link href={`/instructor/${resolvedParams.examId}`}>
              <Button variant="outline">돌아가기</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get current question data
  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
    | Submission
    | undefined;
  const currentGrade = sessionData.grades?.[selectedQuestionIdx] as
    | Grade
    | undefined;
  const currentAiDependency = currentGrade?.stage_grading?.chat?.ai_dependency;
  const overallAiDependency = overallSummary?.aiDependency || null;

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
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
          <div className="mb-8">
            <GradeHeader
              studentName={sessionData.student.name}
              submittedAt={sessionData.session.submitted_at}
              overallScore={sessionData.overallScore}
              examId={resolvedParams.examId}
              studentNumber={sessionData.student.student_number}
              school={sessionData.student.school}
              onBackClick={handleBackClick}
            />
          </div>

          {/* 강제 종료 자동 제출 안내 배너 */}
          {sessionData.session.auto_submitted && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  강제 종료로 자동 제출된 세션
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  이 세션은 시험 강제 종료로 자동 제출되었습니다. 자동 저장된 답변만 표시됩니다.
                </p>
              </div>
            </div>
          )}

          {/* AI 재채점 경고 배너 */}
          {(sessionData.overallScore === null || sessionData.overallScore === 0) &&
            Object.keys(sessionData.grades).length === 0 && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    자동 채점 결과가 없습니다
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    배경 자동 채점이 실패했을 수 있습니다. AI 재채점을 실행해주세요.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRegrade}
                disabled={isRegrading}
                variant="outline"
                className="border-amber-300 dark:border-amber-700 shrink-0"
              >
                {isRegrading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    재채점 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    AI 재채점
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 데이터 표시 */}
          {examStats && (
            <div className="mb-6">
              <Collapsible open={examStatsOpen} onOpenChange={setExamStatsOpen}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        <CardTitle>시험 응시 데이터</CardTitle>
                      </div>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="p-1 hover:bg-accent rounded-md transition-colors"
                        >
                          {examStatsOpen ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CardDescription>
                      학생의 시험 응시 과정에서 수집된 데이터입니다
                    </CardDescription>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="grid gap-4 md:grid-cols-3 mb-6">
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
                          {averageStats.averageExamDuration !== null && (
                            <div className="text-xs text-muted-foreground">
                              전체 평균:{" "}
                              {Math.round(averageStats.averageExamDuration)}분
                            </div>
                          )}
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
                          {averageStats.averageQuestions !== null && (
                            <div className="text-xs text-muted-foreground">
                              전체 평균:{" "}
                              {Math.round(averageStats.averageQuestions)}개
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            문항당 평균:{" "}
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
                          {averageStats.averageAnswerLength !== null && (
                            <div className="text-xs text-muted-foreground">
                              전체 평균:{" "}
                              {Math.round(
                                averageStats.averageAnswerLength
                              ).toLocaleString()}
                              자
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            문항당 평균:{" "}
                            {examStats.averageAnswerLength.toLocaleString()}자
                          </div>
                        </div>
                      </div>

                      {/* 전체 분포에서의 위치 (Bell Curve) */}
                      {(averageStats.averageScore !== null ||
                        averageStats.averageQuestions !== null ||
                        averageStats.averageAnswerLength !== null ||
                        averageStats.averageExamDuration !== null) && (
                        <div className="pt-4 border-t">
                          <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                            전체 분포에서의 위치
                          </h4>
                          <div className="grid gap-3 md:grid-cols-2">
                            {/* 시험 소요 시간 Bell Curve */}
                            {averageStats.averageExamDuration !== null &&
                              averageStats.standardDeviationExamDuration !==
                                null &&
                              examStats.examDuration !== null && (
                                <div className="p-3 rounded-lg border bg-muted/30">
                                  <h5 className="text-xs font-medium mb-2 text-muted-foreground">
                                    시험 소요 시간
                                  </h5>
                                  {(() => {
                                    const avg = Math.round(
                                      averageStats.averageExamDuration
                                    );
                                    const stdDev = Math.max(
                                      averageStats.standardDeviationExamDuration,
                                      1
                                    );
                                    const studentValue = examStats.examDuration;
                                    // 평균 ± 3σ 범위
                                    const min = Math.max(0, avg - stdDev * 3);
                                    const max = avg + stdDev * 3;
                                    const points = 200;

                                    // 정규분포 곡선 데이터 생성 (중복 제거)
                                    const bellCurveDataMap = new Map<
                                      number,
                                      number
                                    >();
                                    for (let i = 0; i < points; i++) {
                                      const x =
                                        min + (max - min) * (i / (points - 1));
                                      const roundedX = Math.round(x * 10) / 10;
                                      const normalizedX = (x - avg) / stdDev;
                                      const y =
                                        Math.exp(
                                          -0.5 * normalizedX * normalizedX
                                        ) * 100;
                                      // 중복 제거: 같은 x 값이면 더 큰 y 값 사용
                                      if (
                                        !bellCurveDataMap.has(roundedX) ||
                                        bellCurveDataMap.get(roundedX)! < y
                                      ) {
                                        bellCurveDataMap.set(roundedX, y);
                                      }
                                    }
                                    const bellCurveData = Array.from(
                                      bellCurveDataMap.entries()
                                    )
                                      .map(([x, y]) => ({ x, y }))
                                      .sort((a, b) => a.x - b.x);

                                    return (
                                      <ChartContainer
                                        config={{
                                          distribution: {
                                            label: "분포",
                                            color: "#3B82F6",
                                          },
                                          student: {
                                            label: "이 학생",
                                            color: "hsl(var(--destructive))",
                                          },
                                        }}
                                        className="h-[140px]"
                                      >
                                        <AreaChart
                                          data={bellCurveData}
                                          margin={{
                                            top: 5,
                                            right: 5,
                                            left: 5,
                                            bottom: 5,
                                          }}
                                        >
                                          <defs>
                                            <linearGradient
                                              id="colorDuration"
                                              x1="0"
                                              y1="0"
                                              x2="0"
                                              y2="1"
                                            >
                                              <stop
                                                offset="5%"
                                                stopColor="#3B82F6"
                                                stopOpacity={0.3}
                                              />
                                              <stop
                                                offset="95%"
                                                stopColor="#3B82F6"
                                                stopOpacity={0}
                                              />
                                            </linearGradient>
                                          </defs>
                                          <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="hsl(var(--border))"
                                            opacity={0.2}
                                          />
                                          <XAxis
                                            dataKey="x"
                                            type="number"
                                            scale="linear"
                                            domain={[min, max]}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10 }}
                                            tickCount={3}
                                            allowDecimals={false}
                                            tickFormatter={(value) =>
                                              `${Math.round(value)}분`
                                            }
                                          />
                                          <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={false}
                                            domain={[0, 110]}
                                          />
                                          <Area
                                            type="natural"
                                            dataKey="y"
                                            stroke="#3B82F6"
                                            strokeWidth={2}
                                            fill="url(#colorDuration)"
                                            activeDot={false}
                                          />
                                          <ReferenceLine
                                            x={studentValue}
                                            stroke="#1E40AF"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            label={{
                                              position: "top",
                                              fill: "#1E40AF",
                                              fontSize: 10,
                                            }}
                                          />
                                          <ReferenceDot
                                            x={studentValue}
                                            y={(() => {
                                              // bell curve에서 학생 위치의 정확한 y 값 계산
                                              const normalizedX =
                                                (studentValue - avg) / stdDev;
                                              return (
                                                Math.exp(
                                                  -0.5 *
                                                    normalizedX *
                                                    normalizedX
                                                ) * 100
                                              );
                                            })()}
                                            r={5}
                                            fill="#1E40AF"
                                            stroke="white"
                                            strokeWidth={2}
                                          />
                                          <ReferenceLine
                                            x={avg}
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeWidth={1.5}
                                            strokeDasharray="3 3"
                                            label={{
                                              position: "top",
                                              fill: "hsl(var(--muted-foreground))",
                                              fontSize: 9,
                                            }}
                                          />
                                        </AreaChart>
                                      </ChartContainer>
                                    );
                                  })()}
                                </div>
                              )}

                            {/* 질문 수 Bell Curve */}
                            {averageStats.averageQuestions !== null &&
                              averageStats.standardDeviationQuestions !==
                                null && (
                                <div className="p-3 rounded-lg border bg-muted/30">
                                  <h5 className="text-xs font-medium mb-2 text-muted-foreground">
                                    AI 질문 수
                                  </h5>
                                  {(() => {
                                    const avg = Math.round(
                                      averageStats.averageQuestions
                                    );
                                    const stdDev = Math.max(
                                      averageStats.standardDeviationQuestions,
                                      1
                                    );
                                    const studentValue =
                                      examStats.questionCount;
                                    const min = Math.max(0, avg - stdDev * 3);
                                    const max = avg + stdDev * 3;
                                    const points = 200;

                                    // 정규분포 곡선 데이터 생성 (중복 제거)
                                    const bellCurveDataMap = new Map<
                                      number,
                                      number
                                    >();
                                    for (let i = 0; i < points; i++) {
                                      const x =
                                        min + (max - min) * (i / (points - 1));
                                      const roundedX = Math.round(x);
                                      const normalizedX = (x - avg) / stdDev;
                                      const y =
                                        Math.exp(
                                          -0.5 * normalizedX * normalizedX
                                        ) * 100;
                                      // 중복 제거: 같은 x 값이면 더 큰 y 값 사용
                                      if (
                                        !bellCurveDataMap.has(roundedX) ||
                                        bellCurveDataMap.get(roundedX)! < y
                                      ) {
                                        bellCurveDataMap.set(roundedX, y);
                                      }
                                    }
                                    const bellCurveData = Array.from(
                                      bellCurveDataMap.entries()
                                    )
                                      .map(([x, y]) => ({ x, y }))
                                      .sort((a, b) => a.x - b.x);

                                    return (
                                      <ChartContainer
                                        config={{
                                          student: {
                                            color: "hsl(var(--destructive))",
                                          },
                                        }}
                                        className="h-[140px]"
                                      >
                                        <AreaChart
                                          data={bellCurveData}
                                          margin={{
                                            top: 5,
                                            right: 5,
                                            left: 5,
                                            bottom: 5,
                                          }}
                                        >
                                          <defs>
                                            <linearGradient
                                              id="colorQuestions"
                                              x1="0"
                                              y1="0"
                                              x2="0"
                                              y2="1"
                                            >
                                              <stop
                                                offset="5%"
                                                stopColor="#60A5FA"
                                                stopOpacity={0.3}
                                              />
                                              <stop
                                                offset="95%"
                                                stopColor="#60A5FA"
                                                stopOpacity={0}
                                              />
                                            </linearGradient>
                                          </defs>
                                          <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="hsl(var(--border))"
                                            opacity={0.2}
                                          />
                                          <XAxis
                                            dataKey="x"
                                            type="number"
                                            scale="linear"
                                            domain={[min, max]}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10 }}
                                            tickCount={3}
                                            allowDecimals={false}
                                          />
                                          <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={false}
                                            domain={[0, 110]}
                                          />
                                          <Area
                                            type="natural"
                                            dataKey="y"
                                            stroke="#60A5FA"
                                            strokeWidth={2}
                                            fill="url(#colorQuestions)"
                                            activeDot={false}
                                          />
                                          <ReferenceLine
                                            x={studentValue}
                                            stroke="#1E40AF"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            label={{
                                              position: "top",
                                              fill: "#1E40AF",
                                              fontSize: 10,
                                            }}
                                          />
                                          <ReferenceDot
                                            x={studentValue}
                                            y={(() => {
                                              // bell curve에서 학생 위치의 정확한 y 값 계산
                                              const normalizedX =
                                                (studentValue - avg) / stdDev;
                                              return (
                                                Math.exp(
                                                  -0.5 *
                                                    normalizedX *
                                                    normalizedX
                                                ) * 100
                                              );
                                            })()}
                                            r={5}
                                            fill="#1E40AF"
                                            stroke="white"
                                            strokeWidth={2}
                                          />
                                          <ReferenceLine
                                            x={avg}
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeWidth={1.5}
                                            strokeDasharray="3 3"
                                            label={{
                                              position: "top",
                                              fill: "hsl(var(--muted-foreground))",
                                              fontSize: 9,
                                            }}
                                          />
                                        </AreaChart>
                                      </ChartContainer>
                                    );
                                  })()}
                                </div>
                              )}

                            {/* 답안 길이 Bell Curve */}
                            {averageStats.averageAnswerLength !== null &&
                              averageStats.standardDeviationAnswerLength !==
                                null && (
                                <div className="p-3 rounded-lg border bg-muted/30">
                                  <h5 className="text-xs font-medium mb-2 text-muted-foreground">
                                    답안 길이
                                  </h5>
                                  {(() => {
                                    const avg = Math.round(
                                      averageStats.averageAnswerLength
                                    );
                                    const stdDev = Math.max(
                                      averageStats.standardDeviationAnswerLength,
                                      1
                                    );
                                    const studentValue =
                                      examStats.averageAnswerLength;
                                    const min = Math.max(0, avg - stdDev * 3);
                                    const max = avg + stdDev * 3;
                                    const points = 200;

                                    // 정규분포 곡선 데이터 생성 (중복 제거)
                                    const bellCurveDataMap = new Map<
                                      number,
                                      number
                                    >();
                                    for (let i = 0; i < points; i++) {
                                      const x =
                                        min + (max - min) * (i / (points - 1));
                                      const roundedX = Math.round(x);
                                      const normalizedX = (x - avg) / stdDev;
                                      const y =
                                        Math.exp(
                                          -0.5 * normalizedX * normalizedX
                                        ) * 100;
                                      // 중복 제거: 같은 x 값이면 더 큰 y 값 사용
                                      if (
                                        !bellCurveDataMap.has(roundedX) ||
                                        bellCurveDataMap.get(roundedX)! < y
                                      ) {
                                        bellCurveDataMap.set(roundedX, y);
                                      }
                                    }
                                    const bellCurveData = Array.from(
                                      bellCurveDataMap.entries()
                                    )
                                      .map(([x, y]) => ({ x, y }))
                                      .sort((a, b) => a.x - b.x);

                                    return (
                                      <ChartContainer
                                        config={{
                                          distribution: {
                                            label: "분포",
                                            color: "#93C5FD",
                                          },
                                          student: {
                                            label: "이 학생",
                                            color: "hsl(var(--destructive))",
                                          },
                                        }}
                                        className="h-[140px]"
                                      >
                                        <AreaChart
                                          data={bellCurveData}
                                          margin={{
                                            top: 5,
                                            right: 5,
                                            left: 5,
                                            bottom: 5,
                                          }}
                                        >
                                          <defs>
                                            <linearGradient
                                              id="colorAnswerLength"
                                              x1="0"
                                              y1="0"
                                              x2="0"
                                              y2="1"
                                            >
                                              <stop
                                                offset="5%"
                                                stopColor="#93C5FD"
                                                stopOpacity={0.3}
                                              />
                                              <stop
                                                offset="95%"
                                                stopColor="#93C5FD"
                                                stopOpacity={0}
                                              />
                                            </linearGradient>
                                          </defs>
                                          <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="hsl(var(--border))"
                                            opacity={0.2}
                                          />
                                          <XAxis
                                            dataKey="x"
                                            type="number"
                                            scale="linear"
                                            domain={[min, max]}
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10 }}
                                            tickCount={3}
                                            allowDecimals={false}
                                            tickFormatter={(value) =>
                                              `${Math.round(value / 100)}00`
                                            }
                                          />
                                          <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={false}
                                            domain={[0, 110]}
                                          />
                                          <Area
                                            type="natural"
                                            dataKey="y"
                                            stroke="#93C5FD"
                                            strokeWidth={2}
                                            fill="url(#colorAnswerLength)"
                                            activeDot={false}
                                          />
                                          <ReferenceLine
                                            x={studentValue}
                                            stroke="#1E40AF"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            label={{
                                              position: "top",
                                              fill: "#1E40AF",
                                              fontSize: 10,
                                            }}
                                          />
                                          <ReferenceDot
                                            x={studentValue}
                                            y={(() => {
                                              // bell curve에서 학생 위치의 정확한 y 값 계산
                                              const normalizedX =
                                                (studentValue - avg) / stdDev;
                                              return (
                                                Math.exp(
                                                  -0.5 *
                                                    normalizedX *
                                                    normalizedX
                                                ) * 100
                                              );
                                            })()}
                                            r={5}
                                            fill="#1E40AF"
                                            stroke="white"
                                            strokeWidth={2}
                                          />
                                          <ReferenceLine
                                            x={avg}
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeWidth={1.5}
                                            strokeDasharray="3 3"
                                            label={{
                                              position: "top",
                                              fill: "hsl(var(--muted-foreground))",
                                              fontSize: 9,
                                            }}
                                          />
                                        </AreaChart>
                                      </ChartContainer>
                                    );
                                  })()}
                                </div>
                              )}
                          </div>
                        </div>
                      )}

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
                        <div className="pt-4 border-t">
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
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">
                                  전체 붙여넣기:
                                </span>
                                <Badge variant="outline" className="text-sm">
                                  {examStats.totalPasteLogs}회
                                </Badge>
                              </div>
                              {examStats.suspiciousPasteLogs > 0 && (
                                <div className="flex items-center gap-3 pt-3 border-t border-red-200">
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
                isGraded={!!sessionData.grades[selectedQuestionIdx]}
                isAiGradedOnly={isCurrentQuestionAiGradedOnly}
                aiGradedScore={currentAiGradedScore}
                saving={saveGradeMutation.isPending}
                onStageScoreChange={handleStageScoreChange}
                onStageCommentChange={handleStageCommentChange}
                onOverallScoreChange={(value) =>
                  setScores({
                    ...scores,
                    [selectedQuestionIdx]: value,
                  })
                }
                onAcceptAiScore={handleAcceptAiScore}
                onSave={() => handleSaveGrade(selectedQuestionIdx)}
              />

              <AiDependencySummaryCard
                mode="instructor"
                questionAssessment={currentAiDependency}
                overallSummary={overallAiDependency}
              />

              {/* PDF 기능 임시 숨김 — 고도화 후 복원 예정
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
                          description: undefined,
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
                        aiSummary: undefined,
                      }
                    : undefined
                }
              />
              */}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* 뒤로 가기 확인 다이얼로그 */}
      <AlertDialog open={showBackConfirm} onOpenChange={setShowBackConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>채점이 완료되지 않았습니다</AlertDialogTitle>
            <AlertDialogDescription>
              가채점만 있는 문제가 있습니다. 반드시 교수가 직접 점수를 입력해야
              합니다. 그래도 뒤로 가시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowBackConfirm(false);
                window.location.href = `/instructor/${resolvedParams.examId}`;
              }}
            >
              뒤로 가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
