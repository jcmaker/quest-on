"use client";

import { redirect } from "next/navigation";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import React, { useState, useEffect, use, useMemo, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { ExamDetailsCard } from "@/components/instructor/ExamDetailsCard";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
import { ExamControlButtons } from "@/components/instructor/ExamControlButtons";
import { LateEntryPanel } from "@/components/instructor/LateEntryPanel";
import { ExamStudentRow } from "@/components/instructor/ExamStudentRow";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronDown, ChevronUp, RefreshCw, Loader2, Eye, EyeOff, Download, Bot } from "lucide-react";
import { StudentLiveMonitoring } from "@/components/instructor/StudentLiveMonitoring";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { InstructorChatSidebar } from "@/components/instructor/InstructorChatSidebar";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useExamStudentSummaries } from "@/hooks/useExamStudentSummaries";
import {
  useStudentFiltering,
  type StudentFilterSortOption,
} from "@/hooks/useStudentFiltering";
import { buildInstructorExamContext } from "@/lib/instructor-utils";
import { qk } from "@/lib/query-keys";
import type { InstructorExam } from "@/lib/types/exam";
import type { ExamStudentSummary } from "@/lib/types/student-summary";
import { BulkGradingPanel } from "@/components/instructor/BulkGradingPanel";

export default function ExamDetail({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user, profile } = useAppUser();

  const [monitoringStudent, setMonitoringStudent] = useState<ExamStudentSummary | null>(null);
  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [bulkGradingOpen, setBulkGradingOpen] = useState(false);

  const {
    exam,
    setExam,
    examDetailData,
    examDetailLoading,
    loading,
    error,
  } = useExamDetail({
    examId: resolvedParams.examId,
    isLoaded,
    isSignedIn,
    userId: user?.id,
  });

  const hasGradingInProgress = useMemo(
    () => exam?.status === "closed",
    [exam?.status]
  );

  const {
    data: students = [],
    isLoading: summariesLoading,
    isFetching: summariesFetching,
    isError: summariesError,
    error: summariesErrorDetail,
    refetch: refetchSummaries,
  } = useExamStudentSummaries({
    examId: resolvedParams.examId,
    enabled: !!exam && isLoaded && !!isSignedIn,
    refetchInterval: hasGradingInProgress ? 10000 : false,
  });

  const {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    filteredAndSortedStudents,
  } = useStudentFiltering({
    students,
    defaultSort: "name",
  });

  const queryClient = useQueryClient();

  const releaseGradesMutation = useMutation({
    mutationFn: async (release: boolean) => {
      const url = `/api/exam/${resolvedParams.examId}/release-grades`;
      const response = await fetch(url, {
        method: release ? "POST" : "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "성적 공개 상태 변경에 실패했습니다.");
      }
      return response.json();
    },
    onSuccess: (_data, release) => {
      setExam((prev) => (prev ? { ...prev, grades_released: release } : prev));
      queryClient.invalidateQueries({
        queryKey: qk.instructor.examDetail(resolvedParams.examId),
      });
    },
  });

  const handleToggleGradesRelease = () => {
    const currentlyReleased = exam?.grades_released === true;
    const msg = currentlyReleased
      ? "학생들에게 성적이 비공개됩니다. 계속하시겠습니까?"
      : "학생들에게 성적이 공개됩니다. 계속하시겠습니까?";
    if (window.confirm(msg)) {
      releaseGradesMutation.mutate(!currentlyReleased);
    }
  };

  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, profile?.role]);

  const questionsCount = examDetailData?.questionsCount ?? null;
  const questionsLoading = examDetailLoading;
  const questions = (questionsOpen ? examDetailData?.questionsRaw : null) ?? [];

  const handleLiveMonitoring = (student: ExamStudentSummary) => {
    setMonitoringStudent(student);
  };

  const handleCloseMonitoring = () => {
    setMonitoringStudent(null);
  };

  const hasIncompleteGrading = useMemo(() => {
    return students.some(
      (s) =>
        s.status === "submitted" &&
        s.caseProgress.total > 0 &&
        s.caseProgress.graded < s.caseProgress.total
    );
  }, [students]);

  const hasCaseQuestions = useMemo(() => {
    if (!exam?.questions) return false;
    const qs = Array.isArray(exam.questions) ? exam.questions : [];
    return qs.some(
      (q) => q.type !== "multiple-choice" && q.type !== "true-false",
    );
  }, [exam]);

  const hasSubmittedStudents = useMemo(
    () => students.some((s) => s.status === "submitted"),
    [students],
  );

  const handleExcelDownload = useCallback(() => {
    if (!exam) return;
    if (hasIncompleteGrading) {
      window.alert("채점이 완료돼지 않았습니다. 채점을 완료한 후에 이용해주세요");
      return;
    }
    window.location.href = `/api/exam/${exam.id}/export/excel`;
  }, [exam, hasIncompleteGrading]);

  const examContext = useMemo(() => {
    if (!exam) return "";
    return buildInstructorExamContext(exam, questions);
  }, [exam, questions]);

  const studentsLoading = loading || summariesLoading || summariesFetching;

  if (!isLoaded || loading) {
    return <PageSpinner />;
  }

  if (!isSignedIn || (profile?.role as string) !== "instructor") {
    return null;
  }

  if (error || !exam) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">오류 발생</h2>
          <p className="text-muted-foreground">
            {error || "시험 데이터를 불러올 수 없습니다."}
          </p>
          <Link href="/instructor" className="inline-block mt-4">
            <Button variant="outline">시험 목록으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false} className="flex-row-reverse">
      <InstructorChatSidebar
        context={examContext}
        sessionIdSeed={`exam_${exam.id}`}
        scopeDescription="시험/문항/학생 데이터"
        title="시험 도우미"
        subtitle="이 화면에 보이는 데이터 범위 안에서만 답변합니다."
      />

      <SidebarInset>
        <div className="container mx-auto p-4 sm:p-6">
          <ExamDetailHeader
            title={exam.title}
            code={exam.code}
            examId={exam.id}
            extraActions={
              <>
                {process.env.NODE_ENV === "development" && (
                  <div className="text-xs text-muted-foreground mr-2">
                    Status: {exam.status || "undefined"} |
                    Gate: {!!(exam.open_at || exam.close_at) ? "true" : "false"}
                  </div>
                )}
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500"
                  onClick={handleExcelDownload}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Excel 다운로드
                </Button>
                <ExamControlButtons
                  examId={exam.id}
                  examStatus={exam.status || "draft"}
                  hasGateFields={!!(exam.open_at || exam.close_at)}
                  onStatusChange={(newStatus, startedAt) => {
                    setExam((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        status: newStatus as InstructorExam["status"],
                        started_at: startedAt || prev.started_at,
                      };
                    });
                    queryClient.invalidateQueries({
                      queryKey: qk.instructor.examDetail(resolvedParams.examId),
                    });
                    queryClient.invalidateQueries({
                      queryKey: qk.instructor.studentSummaries(resolvedParams.examId),
                    });
                  }}
                />
              </>
            }
          />

          <div className="space-y-3 mt-6 mb-6">
            <div id="exam-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">시험 정보</h3>
                        <span className="text-sm text-muted-foreground">
                          {exam.duration}분 &bull; {exam.code}
                        </span>
                      </div>
                      {examInfoOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <ExamDetailsCard
                        description={exam.description}
                        duration={exam.duration}
                        createdAt={exam.createdAt}
                        examCode={exam.code}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>

            <div id="questions-section">
              <Collapsible open={questionsOpen} onOpenChange={setQuestionsOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">문제 보기</h3>
                        <span className="text-sm text-muted-foreground">
                          {questionsCount !== null
                            ? `${questionsCount}개 문제`
                            : "문제 로딩 중..."}
                        </span>
                      </div>
                      {questionsOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      {questionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                      ) : (
                        <QuestionsListCard questions={questions} />
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">학생 목록</h3>

            {exam.status === "running" && (
              <LateEntryPanel examId={exam.id} examStatus={exam.status} />
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                {exam.grades_released ? (
                  <Eye className="h-4 w-4 text-green-600" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {exam.grades_released ? "성적 공개중" : "성적 비공개"}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {exam.grades_released
                    ? "학생들이 점수와 응시 내용을 볼 수 있습니다"
                    : "학생들은 답안만 확인할 수 있습니다"}
                </span>
              </div>
              <Button
                size="sm"
                variant={exam.grades_released ? "outline" : "default"}
                disabled={releaseGradesMutation.isPending}
                onClick={handleToggleGradesRelease}
              >
                {releaseGradesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : exam.grades_released ? (
                  <EyeOff className="h-4 w-4 mr-1.5" />
                ) : (
                  <Eye className="h-4 w-4 mr-1.5" />
                )}
                {exam.grades_released ? "성적 비공개" : "성적 공개"}
              </Button>
            </div>

            {hasCaseQuestions && hasSubmittedStudents && (
              <div className="flex items-center justify-between p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Case AI 자동 채점하기
                    </span>
                    <span className="text-xs text-blue-600 dark:text-blue-400 hidden sm:inline ml-2">
                      강사 인터뷰 후 AI가 서술형 문제를 일괄 채점합니다
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shrink-0"
                  onClick={() => setBulkGradingOpen(true)}
                >
                  채점 시작
                </Button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="학생 이름, 이메일, 학번, 학교로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={sortOption}
                onValueChange={(v) => setSortOption(v as StudentFilterSortOption)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="정렬 기준" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">이름순</SelectItem>
                  <SelectItem value="studentNumber">학번순</SelectItem>
                  <SelectItem value="submittedAt">제출 빠른 순</SelectItem>
                  <SelectItem value="overallStatus">채점 상태순</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: qk.instructor.lateStudents(resolvedParams.examId),
                  });
                  queryClient.invalidateQueries({
                    queryKey: qk.instructor.examDetail(resolvedParams.examId),
                  });
                  void refetchSummaries();
                }}
                title="새로고침"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              총 {filteredAndSortedStudents.length}명
            </p>

            {studentsLoading ? (
              <div className="border rounded-lg overflow-hidden p-4 space-y-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : summariesError ? (
              <div className="border border-destructive/30 rounded-lg p-12 text-center">
                <p className="text-destructive font-medium mb-2">
                  학생 목록을 불러오지 못했습니다
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {summariesErrorDetail instanceof Error
                    ? summariesErrorDetail.message
                    : "잠시 후 다시 시도해 주세요."}
                </p>
                <Button variant="outline" onClick={() => void refetchSummaries()}>
                  다시 시도
                </Button>
              </div>
            ) : filteredAndSortedStudents.length === 0 ? (
              <div className="border rounded-lg p-12 text-center text-muted-foreground">
                <p>표시할 학생이 없습니다.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-3 hidden md:block">
                  <div className="grid grid-cols-[1fr_72px_72px_72px_140px_100px_80px] gap-3 items-center text-sm font-medium text-muted-foreground">
                    <span>학생</span>
                    <span className="text-center">객관식</span>
                    <span className="text-center">O/X</span>
                    <span className="text-center">서술</span>
                    <span>제출일시</span>
                    <span>상태</span>
                    <span className="text-center">액션</span>
                  </div>
                </div>
                <div className="divide-y max-h-[calc(100vh-400px)] min-h-[320px] overflow-y-auto">
                  {(filteredAndSortedStudents as ExamStudentSummary[]).map(
                    (student) => (
                      <ExamStudentRow
                        key={student.sessionId}
                        student={student}
                        examId={exam.id}
                        onLiveMonitoring={handleLiveMonitoring}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>

          {monitoringStudent && (
            <StudentLiveMonitoring
              open={monitoringStudent !== null}
              onOpenChange={(open: boolean) => {
                if (!open) handleCloseMonitoring();
              }}
              sessionId={monitoringStudent.sessionId}
              studentName={monitoringStudent.name}
              studentNumber={monitoringStudent.studentNumber}
              school={monitoringStudent.school}
            />
          )}
        </div>
      </SidebarInset>

      <BulkGradingPanel
        examId={exam.id}
        open={bulkGradingOpen}
        onOpenChange={setBulkGradingOpen}
        onCommitted={() => void refetchSummaries()}
      />
    </SidebarProvider>
  );
}

function PageSpinner() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </div>
  );
}
