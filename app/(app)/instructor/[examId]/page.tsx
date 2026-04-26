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
import { ExamAnalyticsCard } from "@/components/instructor/ExamAnalyticsCard";
import { ExamControlButtons } from "@/components/instructor/ExamControlButtons";
import { LateEntryPanel } from "@/components/instructor/LateEntryPanel";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ChevronDown, ChevronUp, RefreshCw, CheckCheck, Loader2, Eye, EyeOff, Download } from "lucide-react";
import { StudentLiveMonitoring } from "@/components/instructor/StudentLiveMonitoring";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { InstructorChatSidebar } from "@/components/instructor/InstructorChatSidebar";
import { StudentListItem } from "@/components/instructor/StudentListItem";
import { StudentListItemSkeleton } from "@/components/instructor/StudentListItemSkeleton";
import { useExamDetail } from "@/hooks/useExamDetail";
import { useStudentFiltering } from "@/hooks/useStudentFiltering";
import { buildInstructorExamContext } from "@/lib/instructor-utils";
import { qk } from "@/lib/query-keys";
import type { InstructorExam, InstructorStudent, SortOption } from "@/lib/types/exam";

export default function ExamDetail({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user, profile } = useAppUser();

  const [monitoringSessionId, setMonitoringSessionId] = useState<string | null>(null);
  const [monitoringStudent, setMonitoringStudent] = useState<InstructorStudent | null>(null);
  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  // Data loading
  const {
    exam,
    setExam,
    examDetailData,
    examDetailLoading,
    examDetailFetching,
    loading,
    error,
    analyticsData,
    analyticsLoading,
  } = useExamDetail({
    examId: resolvedParams.examId,
    isLoaded,
    isSignedIn,
    userId: user?.id,
  });

  // Student filtering
  const {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    gradedStudents,
    nonGradedStudents,
  } = useStudentFiltering({ students: exam?.students ?? [] });

  const queryClient = useQueryClient();

  // Bulk approve state
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

  const aiGradedStudents = useMemo(
    () => nonGradedStudents.filter((s) => s.gradeType === "ai_graded"),
    [nonGradedStudents]
  );

  const handleSelectStudent = useCallback((sessionId: string, checked: boolean) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  const handleSelectAllAiGraded = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedSessionIds(new Set(aiGradedStudents.map((s) => s.id)));
    } else {
      setSelectedSessionIds(new Set());
    }
  }, [aiGradedStudents]);

  const bulkApproveMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const response = await fetch(`/api/exam/${resolvedParams.examId}/bulk-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "일괄 승인에 실패했습니다.");
      }
      return response.json();
    },
    onSuccess: () => {
      setSelectedSessionIds(new Set());
      queryClient.invalidateQueries({ queryKey: qk.instructor.finalGrades(resolvedParams.examId) });
      queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(resolvedParams.examId) });
    },
  });

  // Grades release mutation
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
      setExam((prev) => prev ? { ...prev, grades_released: release } : prev);
      queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(resolvedParams.examId) });
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

  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (profile?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  const questionsCount = examDetailData?.questionsCount ?? null;
  const questionsLoading = examDetailLoading;
  const questions = (questionsOpen ? examDetailData?.questionsRaw : null) ?? [];

  const handleLiveMonitoring = (student: InstructorStudent) => {
    setMonitoringStudent(student);
    setMonitoringSessionId(student.id);
  };

  const handleCloseMonitoring = () => {
    setMonitoringSessionId(null);
    setMonitoringStudent(null);
  };

  const getStudentStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800";
      case "not-started":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const examContext = useMemo(() => {
    if (!exam) return "";
    return buildInstructorExamContext(exam, questions);
  }, [exam, questions]);

  // --- Early returns ---

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

  // --- Main UI ---

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
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/exam/${exam.id}/export/excel`}>
                    <Download className="h-4 w-4 mr-1.5" />
                    Excel 다운로드
                  </a>
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
                    queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(resolvedParams.examId) });
                    queryClient.invalidateQueries({ queryKey: qk.instructor.examAnalytics(resolvedParams.examId) });
                  }}
                />
              </>
            }
          />

          {/* Collapsible sections */}
          <div className="space-y-3 mt-6 mb-6">
            <div id="exam-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">시험 정보</h3>
                        <span className="text-sm text-muted-foreground">{exam.duration}분 &bull; {exam.code}</span>
                      </div>
                      {examInfoOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <ExamDetailsCard description={exam.description} duration={exam.duration} createdAt={exam.createdAt} examCode={exam.code} />
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
                          {questionsCount !== null ? `${questionsCount}개 문제` : "문제 로딩 중..."}
                        </span>
                      </div>
                      {questionsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      {questionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
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

          {/* Grid: Charts | Student List */}
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_500px]">
            {/* Charts */}
            <div className="space-y-4">
              {analyticsData && !analyticsLoading && (
                <ExamAnalyticsCard
                  averageScore={analyticsData.averageScore || 0}
                  averageQuestions={analyticsData.averageQuestions || 0}
                  averageAnswerLength={analyticsData.averageAnswerLength || 0}
                  averageExamDuration={analyticsData.averageExamDuration || 0}
                  scoreDistribution={analyticsData.statistics?.scoreDistribution || []}
                  questionCountDistribution={analyticsData.statistics?.questionCountDistribution || []}
                  answerLengthDistribution={analyticsData.statistics?.answerLengthDistribution || []}
                  examDurationDistribution={analyticsData.statistics?.examDurationDistribution || []}
                  stageAnalysis={analyticsData.stageAnalysis}
                  rubricAnalysis={analyticsData.rubricAnalysis}
                  questionTypeAnalysis={analyticsData.questionTypeAnalysis}
                />
              )}
              {analyticsLoading && (
                <div className="flex items-center justify-center py-8 border rounded-lg">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              )}
            </div>

            {/* Student List */}
            <div className="space-y-4">
              {/* 지각 학생 패널 — 시험 진행 중에만 */}
              {exam.status === "running" && (
                <LateEntryPanel examId={exam.id} examStatus={exam.status} />
              )}

              {/* Grades Release Toggle */}
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
                  <span className="text-xs text-muted-foreground">
                    {exam.grades_released
                      ? "학생들이 성적과 리포트를 볼 수 있습니다"
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

              {/* Search & Sort */}
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
                <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="정렬 기준" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">가채점 순</SelectItem>
                    <SelectItem value="questionCount">질문 갯수 순</SelectItem>
                    <SelectItem value="answerLength">답안 길이 순</SelectItem>
                    <SelectItem value="submittedAt">제출 빠른 순</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Graded students */}
              {loading || examDetailFetching || !exam ? (
                <div className="border rounded-lg flex flex-col max-h-[300px]">
                  <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-32 mt-2" />
                  </div>
                  <div className="divide-y overflow-y-auto flex-1 p-4 space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <StudentListItemSkeleton key={index} />
                    ))}
                  </div>
                </div>
              ) : (
                gradedStudents.length > 0 && (
                  <div className="border rounded-lg flex flex-col max-h-[300px]">
                    <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                      <h3 className="font-semibold">최종 채점 완료 ({gradedStudents.length}명)</h3>
                      <p className="text-sm text-muted-foreground">교수가 최종 채점한 학생 (점수 순)</p>
                    </div>
                    <div className="divide-y overflow-y-auto flex-1">
                      {gradedStudents.map((student) => (
                        <StudentListItem
                          key={student.id}
                          student={student}
                          examId={exam.id}
                          onLiveMonitoring={handleLiveMonitoring}
                          getStudentStatusColor={getStudentStatusColor}
                          showFinalScore={true}
                          analyticsData={analyticsData}
                          examStatus={exam.status}
                        />
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* Non-graded students */}
              <div className="border rounded-lg flex flex-col h-[calc(100vh-400px)] min-h-[600px]">
                <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">
                        {loading || examDetailFetching || !exam ? (
                          <Skeleton className="h-6 w-32" />
                        ) : (
                          `학생 목록 (${nonGradedStudents.length}명)`
                        )}
                      </h3>
                      {loading || examDetailFetching || !exam ? (
                        <div className="text-sm text-muted-foreground">
                          <Skeleton className="h-4 w-24 mt-2" />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {sortOption === "score" && "가채점 점수 순"}
                          {sortOption === "questionCount" && "질문 갯수 순"}
                          {sortOption === "answerLength" && "답안 길이 순"}
                          {sortOption === "submittedAt" && "제출 빠른 순"}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: qk.instructor.lateStudents(resolvedParams.examId) });
                        queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(resolvedParams.examId) });
                      }}
                      title="새로고침"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Bulk approve controls */}
                  {aiGradedStudents.length > 0 && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={
                            aiGradedStudents.length > 0 &&
                            aiGradedStudents.every((s) => selectedSessionIds.has(s.id))
                          }
                          onCheckedChange={(checked) => handleSelectAllAiGraded(!!checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          AI 채점 전체 선택 ({aiGradedStudents.length}명)
                        </span>
                      </div>
                      {selectedSessionIds.size > 0 && (
                        <Button
                          size="sm"
                          variant="default"
                          className="ml-auto"
                          disabled={bulkApproveMutation.isPending}
                          onClick={() => {
                            bulkApproveMutation.mutate(Array.from(selectedSessionIds));
                          }}
                        >
                          {bulkApproveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <CheckCheck className="h-4 w-4 mr-1.5" />
                          )}
                          일괄 승인 ({selectedSessionIds.size}명)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="divide-y overflow-y-auto flex-1">
                  {loading || examDetailFetching || !exam ? (
                    <div className="p-4 space-y-4">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <StudentListItemSkeleton key={index} />
                      ))}
                    </div>
                  ) : nonGradedStudents.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p>표시할 학생이 없습니다.</p>
                    </div>
                  ) : (
                    nonGradedStudents.map((student) => (
                      <StudentListItem
                        key={student.id}
                        student={student}
                        examId={exam.id}
                        onLiveMonitoring={handleLiveMonitoring}
                        getStudentStatusColor={getStudentStatusColor}
                        showFinalScore={false}
                        analyticsData={analyticsData}
                        examStatus={exam.status}
                        selectable={student.gradeType === "ai_graded"}
                        selected={selectedSessionIds.has(student.id)}
                        onSelect={handleSelectStudent}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {monitoringStudent && monitoringSessionId && (
            <StudentLiveMonitoring
              open={monitoringSessionId !== null}
              onOpenChange={(open: boolean) => { if (!open) handleCloseMonitoring(); }}
              sessionId={monitoringSessionId}
              studentName={monitoringStudent.name}
              studentNumber={monitoringStudent.student_number}
              school={monitoringStudent.school}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
