"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { useState, useEffect, use, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { QuestionNavigation } from "@/components/instructor/QuestionNavigation";
import { QuestionPromptCard } from "@/components/instructor/QuestionPromptCard";
import { AIConversationsCard } from "@/components/instructor/AIConversationsCard";
import { FinalAnswerCard } from "@/components/instructor/FinalAnswerCard";
import { GradingPanel } from "@/components/instructor/GradingPanel";
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
  AlertTriangle,
  RefreshCw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  pasteLogs?: Record<string, PasteLog[]>;
  overallScore: number | null;
}

export default function AssignmentGradePage({
  params,
}: {
  params: Promise<{ assignmentId: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, user, profile } = useAppUser();
  const queryClient = useQueryClient();

  const averageStats = useMemo(() => {
    const avgScore = searchParams.get("avgScore");
    const avgQuestions = searchParams.get("avgQuestions");
    const avgAnswerLength = searchParams.get("avgAnswerLength");
    const avgExamDuration = searchParams.get("avgExamDuration");
    return {
      averageScore: avgScore ? parseFloat(avgScore) : null,
      averageQuestions: avgQuestions ? parseFloat(avgQuestions) : null,
      averageAnswerLength: avgAnswerLength ? parseFloat(avgAnswerLength) : null,
      averageExamDuration: avgExamDuration ? parseFloat(avgExamDuration) : null,
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
  const [showBackConfirm, setShowBackConfirm] = useState<boolean>(false);
  const [acceptedAiScores, setAcceptedAiScores] = useState<
    Record<number, boolean>
  >({});
  const [overallSummary, setOverallSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  const {
    data: sessionData,
    isLoading: loading,
    error: sessionError,
    refetch,
  } = useQuery({
    queryKey: qk.session.grade(resolvedParams.sessionId),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/session/${resolvedParams.sessionId}/grade`,
        { signal }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `채점 데이터 로드 실패 (${response.status})`
        );
      }
      return (await response.json()) as SessionData;
    },
    enabled: !!(
      isLoaded &&
      isSignedIn &&
      (profile?.role as string) === "instructor"
    ),
  });

  const [isRegrading, setIsRegrading] = useState(false);

  const handleRegrade = async () => {
    setIsRegrading(true);
    try {
      const response = await fetch(
        `/api/session/${resolvedParams.sessionId}/grade`,
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
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.sessionId),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "AI 재채점 중 오류가 발생했습니다"
      );
    } finally {
      setIsRegrading(false);
    }
  };

  useEffect(() => {
    if (sessionData) {
      setOverallSummary(sessionData.session.ai_summary || null);
      const initialScores: Record<number, number> = {};
      const initialFeedbacks: Record<number, string> = {};
      const initialStageScores: Record<number, Partial<Record<StageKey, number>>> = {};
      const initialStageComments: Record<number, Partial<Record<StageKey, string>>> = {};

      Object.entries(sessionData.grades).forEach(([qIdx, grade]) => {
        const typedGrade = grade as Grade;
        initialScores[parseInt(qIdx)] = typedGrade.score;
        initialFeedbacks[parseInt(qIdx)] = typedGrade.comment || "";
        if (typedGrade.stage_grading) {
          if (typedGrade.stage_grading.chat) {
            initialStageScores[parseInt(qIdx)] = {
              ...initialStageScores[parseInt(qIdx)],
              chat: typedGrade.stage_grading.chat.score,
            };
            initialStageComments[parseInt(qIdx)] = {
              ...initialStageComments[parseInt(qIdx)],
              chat: typedGrade.stage_grading.chat.comment,
            };
          }
          if (typedGrade.stage_grading.answer) {
            initialStageScores[parseInt(qIdx)] = {
              ...initialStageScores[parseInt(qIdx)],
              answer: typedGrade.stage_grading.answer.score,
            };
            initialStageComments[parseInt(qIdx)] = {
              ...initialStageComments[parseInt(qIdx)],
              answer: typedGrade.stage_grading.answer.comment,
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

  const { data: generatedSummary, isLoading: summaryLoading } = useQuery({
    queryKey: qk.session.summary(sessionData?.session?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/instructor/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionData?.session?.id }),
        signal,
      });
      if (!response.ok) throw new Error("Failed to generate summary");
      const data = await response.json();
      return data.summary as SummaryData;
    },
    enabled: !!sessionData?.session?.id && !sessionData?.session?.ai_summary,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (generatedSummary) setOverallSummary(generatedSummary);
  }, [generatedSummary]);

  const saveGradeMutation = useMutation({
    mutationFn: async (questionIdx: number) => {
      const existingStageGrading = (
        sessionData?.grades?.[questionIdx] as Grade | undefined
      )?.stage_grading;
      const response = await fetch(
        `/api/session/${resolvedParams.sessionId}/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        throw new Error(
          extractErrorMessage(errorData, "채점 저장 중 오류가 발생했습니다", response.status)
        );
      }
      return response.json();
    },
    onMutate: async (questionIdx: number) => {
      await queryClient.cancelQueries({
        queryKey: qk.session.grade(resolvedParams.sessionId),
      });
      const previousData = queryClient.getQueryData(
        qk.session.grade(resolvedParams.sessionId)
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueryData(qk.session.grade(resolvedParams.sessionId), (old: any) => {
        if (!old) return old;
        const updatedGrades = { ...old.grades };
        const existingGrade = updatedGrades[questionIdx] as Grade | undefined;
        updatedGrades[questionIdx] = {
          ...(existingGrade || { id: "optimistic", q_idx: questionIdx }),
          score: scores[questionIdx] || 0,
          comment: feedbacks[questionIdx] || "",
          stage_grading: {
            ...(existingGrade?.stage_grading || {}),
            ...(stageScores[questionIdx]?.chat
              ? {
                  chat: {
                    ...(existingGrade?.stage_grading?.chat || {}),
                    score: stageScores[questionIdx]?.chat || 0,
                    comment: stageComments[questionIdx]?.chat || "",
                  },
                }
              : {}),
            ...(stageScores[questionIdx]?.answer
              ? {
                  answer: {
                    ...(existingGrade?.stage_grading?.answer || {}),
                    score: stageScores[questionIdx]?.answer || 0,
                    comment: stageComments[questionIdx]?.answer || "",
                  },
                }
              : {}),
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
      if (context?.previousData) {
        queryClient.setQueryData(
          qk.session.grade(resolvedParams.sessionId),
          context.previousData
        );
      }
      toast.error(getErrorMessage(error, "채점 저장 중 오류가 발생했습니다"), {
        duration: 5000,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: qk.session.grade(resolvedParams.sessionId),
      });
    },
  });

  const handleSaveGrade = (questionIdx: number) => {
    const currentGrade = sessionData?.grades?.[questionIdx] as Grade | undefined;
    if (currentGrade && isAiGraded(currentGrade)) {
      const originalScore = currentGrade.score;
      const currentScore = scores[questionIdx] || 0;
      const isAccepted = acceptedAiScores[questionIdx] || false;
      if (originalScore === currentScore && !isAccepted) {
        toast.error(
          "가채점 점수를 승인하거나 직접 입력한 후 저장할 수 있습니다.",
          { duration: 4000 }
        );
        return;
      }
    }
    saveGradeMutation.mutate(questionIdx);
  };

  const isCurrentQuestionAiGradedOnly = useMemo(() => {
    if (!sessionData) return false;
    const currentGrade = sessionData.grades?.[selectedQuestionIdx] as Grade | undefined;
    if (!currentGrade) return false;
    if (isAiGraded(currentGrade)) {
      const originalScore = currentGrade.score;
      const currentScore = scores[selectedQuestionIdx] || 0;
      const isAccepted = acceptedAiScores[selectedQuestionIdx] || false;
      return originalScore === currentScore && !isAccepted;
    }
    return false;
  }, [sessionData, selectedQuestionIdx, scores, acceptedAiScores]);

  const currentAiGradedScore = useMemo(() => {
    if (!sessionData) return undefined;
    const currentGrade = sessionData.grades?.[selectedQuestionIdx] as Grade | undefined;
    if (!currentGrade || !isAiGraded(currentGrade)) return undefined;
    return currentGrade.score;
  }, [sessionData, selectedQuestionIdx]);

  const handleAcceptAiScore = () => {
    if (currentAiGradedScore !== undefined) {
      setScores({ ...scores, [selectedQuestionIdx]: currentAiGradedScore });
      setAcceptedAiScores({ ...acceptedAiScores, [selectedQuestionIdx]: true });
      toast.success(
        `가채점 점수 ${currentAiGradedScore}점으로 설정되었습니다. 저장 버튼을 눌러 채점을 완료하세요.`,
        { duration: 3000 }
      );
    }
  };

  const handleBackClick = () => {
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
      window.location.href = `/instructor/assignment/${resolvedParams.assignmentId}`;
    }
  };

  const handleStageScoreChange = (stage: StageKey, value: number) => {
    setStageScores((prev) => ({
      ...prev,
      [selectedQuestionIdx]: { ...(prev[selectedQuestionIdx] || {}), [stage]: value },
    }));
  };

  const handleStageCommentChange = (stage: StageKey, value: string) => {
    setStageComments((prev) => ({
      ...prev,
      [selectedQuestionIdx]: { ...(prev[selectedQuestionIdx] || {}), [stage]: value },
    }));
  };

  const chatContext = useMemo(() => {
    if (!sessionData) return "";
    const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
    const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
      | Submission
      | undefined;
    return [
      `과제 제목: ${sessionData.exam.title}`,
      `과제 코드: ${sessionData.exam.code}`,
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

  // Early returns
  if (!isLoaded) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isSignedIn || (profile?.role as string) !== "instructor") {
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
            {sessionError
              ? "채점 데이터를 불러오는 중 오류가 발생했습니다"
              : "제출물을 찾을 수 없습니다"}
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
            <Link href={`/instructor/assignment/${resolvedParams.assignmentId}`}>
              <Button variant="outline">돌아가기</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
    | Submission
    | undefined;
  const currentGrade = sessionData.grades?.[selectedQuestionIdx] as
    | Grade
    | undefined;
  const currentAiDependency = currentGrade?.stage_grading?.chat?.ai_dependency;
  const overallAiDependency = overallSummary?.aiDependency || null;

  let currentMessages = (sessionData.messages?.[selectedQuestionIdx] || []) as Conversation[];
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] || []) as Conversation[];
  }
  const duringExamMessages = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

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
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="outline" size="sm" onClick={handleBackClick}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                과제로 돌아가기
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">
                  {sessionData.student.name} 학생 채점
                </h1>
                <div className="text-muted-foreground space-y-1 mt-2">
                  <p>
                    제출일:{" "}
                    {new Date(sessionData.session.submitted_at).toLocaleString()}
                  </p>
                  {sessionData.student.student_number && (
                    <p>학번: {sessionData.student.student_number}</p>
                  )}
                  {sessionData.student.school && (
                    <p>학교: {sessionData.student.school}</p>
                  )}
                </div>
                {sessionData.overallScore !== null && (
                  <p className="text-lg font-semibold mt-2">
                    전체 점수: {sessionData.overallScore}점
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* AI 재채점 경고 배너 */}
          {(sessionData.overallScore === null ||
            sessionData.overallScore === 0) &&
            Object.keys(sessionData.grades).length === 0 && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      자동 채점 결과가 없습니다
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      AI 재채점을 실행해주세요.
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

          <div className="mb-6">
            <AIOverallSummary summary={overallSummary} loading={summaryLoading} />
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
                  setScores({ ...scores, [selectedQuestionIdx]: value })
                }
                onAcceptAiScore={handleAcceptAiScore}
                onSave={() => handleSaveGrade(selectedQuestionIdx)}
              />

              <AiDependencySummaryCard
                mode="instructor"
                questionAssessment={currentAiDependency}
                overallSummary={overallAiDependency}
              />
            </div>
          </div>
        </div>
      </SidebarInset>

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
                window.location.href = `/instructor/assignment/${resolvedParams.assignmentId}`;
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
