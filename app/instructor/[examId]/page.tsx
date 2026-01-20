/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import React, { useState, useEffect, use, useMemo } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { ExamDetailsCard } from "@/components/instructor/ExamDetailsCard";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
import { ExamAnalyticsCard } from "@/components/instructor/ExamAnalyticsCard";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Radio } from "@/components/animate-ui/icons/radio";
import { ClipboardCheck } from "@/components/animate-ui/icons/clipboard-check";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { StudentLiveMonitoring } from "../../../components/instructor/StudentLiveMonitoring";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { InstructorChatSidebar } from "@/components/instructor/InstructorChatSidebar";

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  status: "draft" | "active" | "completed";
  createdAt: string;
  questions: Question[];
  students: Student[];
}

interface Question {
  id: string;
  text: string;
  type: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  status: "not-started" | "in-progress" | "completed";
  score?: number;
  finalScore?: number; // 교수가 최종 채점한 점수
  submittedAt?: string;
  createdAt?: string;
  student_number?: string;
  school?: string;
  questionCount?: number;
  answerLength?: number;
  isGraded?: boolean; // 교수가 최종 채점했는지 여부
}

type SortOption = "score" | "questionCount" | "answerLength" | "submittedAt";

export default function ExamDetail({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user } = useUser();

  // Fetch exam data from database
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("score");
  const [monitoringSessionId, setMonitoringSessionId] = useState<string | null>(
    null
  );
  const [monitoringStudent, setMonitoringStudent] = useState<Student | null>(
    null
  );
  const [examInfoOpen, setExamInfoOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsCount, setQuestionsCount] = useState<number | null>(null);

  // Fetch analytics data (for charts only, student scores are already in exam.students)
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: qk.instructor.examAnalytics(resolvedParams.examId),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/analytics/exam/${resolvedParams.examId}/overview`,
        { signal } // AbortSignal 연결
      );
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      return response.json();
    },
    enabled:
      !!resolvedParams.examId &&
      isLoaded &&
      isSignedIn &&
      !!exam &&
      exam.students.length > 0, // 학생이 있을 때만 실행
    staleTime: 30000, // 30초간 캐시 유지
    gcTime: 5 * 60 * 1000, // 5분간 가비지 컬렉션 방지
    refetchOnMount: true, // 컴포넌트가 마운트될 때마다 재요청 (새로고침 시 최신 데이터 보장)
    refetchOnWindowFocus: true, // 창 포커스 시 재요청 (다른 탭에서 돌아올 때 최신 데이터 보장)
  });

  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  // Fetch exam data
  useEffect(() => {
    const fetchExamData = async () => {
      try {
        setLoading(true);

        // 병렬로 필수 데이터 가져오기 (exam + sessions)
        const [examResponse, sessionsResponse] = await Promise.all([
          fetch("/api/supa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "get_exam_by_id",
              data: { id: resolvedParams.examId },
            }),
          }),
          fetch(`/api/exam/${resolvedParams.examId}/sessions`),
        ]);

        if (!examResponse.ok) {
          const errorText = await examResponse.text();
          console.error("API Error Response:", errorText);
          throw new Error(
            `Failed to fetch exam details: ${examResponse.status} ${examResponse.statusText}`
          );
        }

        const examResult = await examResponse.json();

        // Store questions count for display (from API response, but we won't use the actual questions data)
        const questionsArray = examResult.exam.questions || [];
        setQuestionsCount(questionsArray.length);

        // 학생 데이터 처리 (sessions는 이미 가져옴)
        let students: Student[] = [];

        if (sessionsResponse.ok) {
          const sessionsResult = await sessionsResponse.json();

          // 학생별로 세션을 그룹화
          const sessionsByStudent = new Map<
            string,
            Array<Record<string, unknown>>
          >();

          sessionsResult.sessions.forEach(
            (session: Record<string, unknown>) => {
              const studentId =
                typeof session.student_id === "string"
                  ? session.student_id
                  : "";

              if (!sessionsByStudent.has(studentId)) {
                sessionsByStudent.set(studentId, []);
              }
              sessionsByStudent.get(studentId)?.push(session);
            }
          );

          // 각 학생별로 최적의 세션 선택
          students = Array.from(sessionsByStudent.entries()).map(
            ([studentId, sessions]) => {
              // 제출된 세션이 있으면 제출된 세션을 우선 선택 (최신 제출 순)
              const submittedSessions = sessions
                .filter((s) => s.submitted_at != null)
                .sort((a, b) => {
                  const aDate = a.submitted_at
                    ? new Date(a.submitted_at as string).getTime()
                    : 0;
                  const bDate = b.submitted_at
                    ? new Date(b.submitted_at as string).getTime()
                    : 0;
                  return bDate - aDate; // 최신 제출이 먼저
                });

              // 제출된 세션이 없으면 최신 세션 선택
              const unsubmittedSessions = sessions
                .filter((s) => s.submitted_at == null)
                .sort((a, b) => {
                  const aDate = a.created_at
                    ? new Date(a.created_at as string).getTime()
                    : 0;
                  const bDate = b.created_at
                    ? new Date(b.created_at as string).getTime()
                    : 0;
                  return bDate - aDate; // 최신 생성이 먼저
                });

              // 우선순위: 제출된 세션 > 최신 미제출 세션
              const selectedSession =
                submittedSessions.length > 0
                  ? submittedSessions[0]
                  : unsubmittedSessions.length > 0
                  ? unsubmittedSessions[0]
                  : sessions[0]; // 폴백

              const sessionId =
                typeof selectedSession.id === "string"
                  ? selectedSession.id
                  : "";
              const submittedAt =
                selectedSession.submitted_at != null
                  ? typeof selectedSession.submitted_at === "string"
                    ? selectedSession.submitted_at
                    : String(selectedSession.submitted_at)
                  : undefined;

              // Get student name from session data (already fetched from Clerk)
              const studentName =
                typeof selectedSession.student_name === "string"
                  ? selectedSession.student_name
                  : `Student ${studentId.slice(0, 8)}`;
              const studentEmail =
                typeof selectedSession.student_email === "string"
                  ? selectedSession.student_email
                  : `${studentId}@example.com`;

              const createdAt =
                selectedSession.created_at != null
                  ? typeof selectedSession.created_at === "string"
                    ? selectedSession.created_at
                    : String(selectedSession.created_at)
                  : undefined;

              return {
                id: sessionId, // Use session ID for routing to grade page
                name: studentName,
                email: studentEmail,
                status: submittedAt ? "completed" : "in-progress",
                score: undefined, // Will be filled by analytics query
                finalScore: undefined, // Will be filled by final grades query
                submittedAt: submittedAt as string | undefined,
                createdAt: createdAt as string | undefined,
                student_number:
                  typeof selectedSession.student_number === "string"
                    ? selectedSession.student_number
                    : undefined,
                school:
                  typeof selectedSession.student_school === "string"
                    ? selectedSession.student_school
                    : undefined,
                questionCount: undefined, // Will be filled by analytics query
                answerLength: undefined, // Will be filled by analytics query
                isGraded: false, // Will be filled by final grades query
              };
            }
          );
        }

        // 초기 데이터 설정 (점수 정보는 나중에 업데이트)
        setExam({
          id: examResult.exam.id,
          title: examResult.exam.title,
          code: examResult.exam.code,
          description: examResult.exam.description,
          duration: examResult.exam.duration,
          status: examResult.exam.status,
          createdAt: examResult.exam.created_at,
          questions: [], // Don't load questions initially - will be loaded when questionsOpen is true
          students: students,
        });
      } catch (err) {
        console.error("Error fetching exam data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load exam data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchExamData();
  }, [resolvedParams.examId]);

  // Final grades를 별도로 로드하여 학생 데이터 업데이트
  // Analytics는 useQuery에서 이미 처리되므로 여기서는 final grades만 처리
  const [finalGradesLoaded, setFinalGradesLoaded] = useState(false);
  // analyticsProcessed 플래그 제거 - analyticsData가 변경될 때마다 업데이트하도록 변경

  // examId가 변경되면 플래그 리셋
  useEffect(() => {
    setFinalGradesLoaded(false);
  }, [resolvedParams.examId]);

  useEffect(() => {
    if (!exam || exam.students.length === 0 || finalGradesLoaded) return;

    const updateFinalGrades = async () => {
      try {
        const gradesResponse = await fetch(
          `/api/exam/${resolvedParams.examId}/final-grades`
        ).catch(() => null);

        if (!gradesResponse?.ok) return;

        const gradesData = await gradesResponse.json();
        const finalGradesMap = new Map<string, number>();

        if (gradesData.grades) {
          gradesData.grades.forEach(
            (g: { session_id: string; score: number; isManual?: boolean }) => {
              // 교수가 수동으로 채점한 경우만 최종 채점으로 표시
              if (g.isManual) {
                finalGradesMap.set(g.session_id, g.score);
              }
            }
          );
        }

        // 학생 데이터 업데이트 (final grades만)
        setExam((prev) => {
          if (!prev) return prev;

          const updatedStudents = prev.students.map((student) => {
            const finalScore = finalGradesMap.get(student.id);
            const isGraded = finalScore !== undefined;

            return {
              ...student,
              finalScore:
                finalScore !== undefined ? finalScore : student.finalScore,
              isGraded,
            };
          });

          return {
            ...prev,
            students: updatedStudents,
          };
        });

        setFinalGradesLoaded(true);
      } catch (err) {
        console.error("Error updating final grades:", err);
        // 에러가 발생해도 기본 데이터는 유지
      }
    };

    updateFinalGrades();
  }, [exam?.id, resolvedParams.examId, finalGradesLoaded]);

  // Analytics 데이터가 로드되면 학생 점수 업데이트
  // analyticsData가 변경될 때마다 재실행하여 최신 데이터 반영
  useEffect(() => {
    if (!exam || !analyticsData || exam.students.length === 0) return;

    const analyticsStudentsMap = analyticsData.students
      ? new Map(analyticsData.students.map((s: any) => [s.sessionId, s]))
      : new Map();

    // 학생 데이터 업데이트 (analytics 점수만)
    // analyticsData가 로드될 때마다 항상 업데이트하여 최신 점수 반영
    setExam((prev) => {
      if (!prev) return prev;

      const updatedStudents = prev.students.map((student) => {
        const analyticsStudent = analyticsStudentsMap.get(student.id);

        // analytics에서 점수를 가져올 수 있으면 업데이트
        // null이 아닌 경우에만 업데이트 (null은 점수가 없다는 의미)
        return {
          ...student,
          score:
            analyticsStudent?.score !== null && analyticsStudent?.score !== undefined
              ? analyticsStudent.score
              : student.score,
          questionCount:
            analyticsStudent?.questionCount !== null &&
            analyticsStudent?.questionCount !== undefined
              ? analyticsStudent.questionCount
              : student.questionCount,
          answerLength:
            analyticsStudent?.answerLength !== null &&
            analyticsStudent?.answerLength !== undefined
              ? analyticsStudent.answerLength
              : student.answerLength,
        };
      });

      return {
        ...prev,
        students: updatedStudents,
      };
    });
  }, [analyticsData, exam?.id]); // analyticsData가 변경될 때마다 재실행

  // Load questions when questionsOpen becomes true
  useEffect(() => {
    if (questionsOpen && exam && questions.length === 0 && !questionsLoading) {
      const loadQuestions = async () => {
        try {
          setQuestionsLoading(true);
          const examResponse = await fetch("/api/supa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "get_exam_by_id",
              data: { id: resolvedParams.examId },
            }),
          });

          if (examResponse.ok) {
            const examResult = await examResponse.json();
            const questionsArray = examResult.exam.questions || [];
            setQuestions(questionsArray);
          }
        } catch (err) {
          console.error("Error loading questions:", err);
        } finally {
          setQuestionsLoading(false);
        }
      };

      loadQuestions();
    }
  }, [
    questionsOpen,
    exam,
    questions.length,
    questionsLoading,
    resolvedParams.examId,
  ]);

  // Filtered and sorted students
  const filteredAndSortedStudents = useMemo(() => {
    if (!exam) return [];

    let filtered = exam.students.filter((student) => {
      const query = searchQuery.toLowerCase();
      return (
        student.name.toLowerCase().includes(query) ||
        student.email.toLowerCase().includes(query) ||
        student.student_number?.toLowerCase().includes(query) ||
        student.school?.toLowerCase().includes(query)
      );
    });

    // Sort by selected option
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "score":
          // 가채점 점수 기준
          if (a.score !== undefined && b.score === undefined) return -1;
          if (a.score === undefined && b.score !== undefined) return 1;
          if (a.score !== undefined && b.score !== undefined) {
            return b.score - a.score;
          }
          return 0;
        case "questionCount":
          if (a.questionCount !== undefined && b.questionCount === undefined)
            return -1;
          if (a.questionCount === undefined && b.questionCount !== undefined)
            return 1;
          if (a.questionCount !== undefined && b.questionCount !== undefined) {
            return b.questionCount - a.questionCount;
          }
          return 0;
        case "answerLength":
          if (a.answerLength !== undefined && b.answerLength === undefined)
            return -1;
          if (a.answerLength === undefined && b.answerLength !== undefined)
            return 1;
          if (a.answerLength !== undefined && b.answerLength !== undefined) {
            return b.answerLength - a.answerLength;
          }
          return 0;
        case "submittedAt":
          if (a.submittedAt && !b.submittedAt) return -1;
          if (!a.submittedAt && b.submittedAt) return 1;
          if (a.submittedAt && b.submittedAt) {
            return (
              new Date(b.submittedAt).getTime() -
              new Date(a.submittedAt).getTime()
            );
          }
          return 0;
        default:
          return 0;
      }
    });

    return filtered;
  }, [exam, searchQuery, sortOption]);

  // Separated graded students (교수가 최종 채점한 학생)
  const gradedStudents = useMemo(() => {
    return filteredAndSortedStudents
      .filter((s) => s.isGraded)
      .sort((a, b) => {
        if (a.finalScore !== undefined && b.finalScore === undefined) return -1;
        if (a.finalScore === undefined && b.finalScore !== undefined) return 1;
        if (a.finalScore !== undefined && b.finalScore !== undefined) {
          return b.finalScore - a.finalScore;
        }
        return 0;
      });
  }, [filteredAndSortedStudents]);

  // Non-graded students (가채점만 있는 학생)
  const nonGradedStudents = useMemo(() => {
    return filteredAndSortedStudents.filter((s) => !s.isGraded);
  }, [filteredAndSortedStudents]);

  const handleLiveMonitoring = (student: Student) => {
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

  // Don't render anything if not authorized (will redirect)
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
        <div className="container mx-auto p-6">
          <ExamDetailHeader
            title={exam.title}
            code={exam.code}
            examId={exam.id}
          />

          {/* 위쪽: 시험 정보와 문제 (Collapsible) */}
          <div className="space-y-3 mt-6 mb-6">
            {/* 시험 정보 */}
            <div id="exam-info-section">
              <Collapsible open={examInfoOpen} onOpenChange={setExamInfoOpen}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">시험 정보</h3>
                        <span className="text-sm text-muted-foreground">
                          {exam.duration}분 • {exam.code}
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

            {/* 문제 보기 */}
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

          {/* 아래쪽: 좌우 그리드 (차트 | 학생 목록) */}
          <div className="grid gap-6 lg:grid-cols-[1fr_500px]">
            {/* 왼쪽: 차트 */}
            <div className="space-y-4">
              {analyticsData && !analyticsLoading && (
                <ExamAnalyticsCard
                  averageScore={analyticsData.averageScore || 0}
                  averageQuestions={analyticsData.averageQuestions || 0}
                  averageAnswerLength={analyticsData.averageAnswerLength || 0}
                  averageExamDuration={analyticsData.averageExamDuration || 0}
                  scoreDistribution={
                    analyticsData.statistics?.scoreDistribution || []
                  }
                  questionCountDistribution={
                    analyticsData.statistics?.questionCountDistribution || []
                  }
                  answerLengthDistribution={
                    analyticsData.statistics?.answerLengthDistribution || []
                  }
                  examDurationDistribution={
                    analyticsData.statistics?.examDurationDistribution || []
                  }
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

            {/* 오른쪽: 학생 목록 */}
            <div className="space-y-4">
              {/* 검색 및 필터링 */}
              <div className="flex gap-4">
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
                  onValueChange={(v) => setSortOption(v as SortOption)}
                >
                  <SelectTrigger className="w-[200px]">
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

              {/* 최종 채점 학생 목록 - 교수가 실제로 채점한 경우만 표시 */}
              {loading || analyticsLoading || !exam ? (
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
                      <h3 className="font-semibold">
                        최종 채점 완료 ({gradedStudents.length}명)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        교수가 최종 채점한 학생 (점수 순)
                      </p>
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
                        />
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* 가채점 학생 목록 */}
              <div className="border rounded-lg flex flex-col h-[calc(100vh-400px)] min-h-[600px]">
                <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                  <h3 className="font-semibold">
                    {loading || analyticsLoading || !exam ? (
                      <Skeleton className="h-6 w-32" />
                    ) : (
                      `학생 목록 (${nonGradedStudents.length}명)`
                    )}
                  </h3>
                  {loading || analyticsLoading || !exam ? (
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
                <div className="divide-y overflow-y-auto flex-1">
                  {loading || analyticsLoading || !exam ? (
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
              onOpenChange={(open: boolean) => {
                if (!open) handleCloseMonitoring();
              }}
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

function buildInstructorExamContext(exam: Exam, questions: Question[] = []) {
  const total = exam.students?.length ?? 0;
  const completed = exam.students?.filter(
    (s) => s.status === "completed"
  ).length;
  const inProgress = exam.students?.filter(
    (s) => s.status === "in-progress"
  ).length;
  const notStarted = exam.students?.filter(
    (s) => s.status === "not-started"
  ).length;
  const graded = exam.students?.filter((s) => s.isGraded).length ?? 0;
  const hasScores = exam.students?.filter(
    (s) => typeof s.score === "number"
  ).length;

  const questionsPreview = questions
    .slice(0, 12)
    .map((q, i) => `${i + 1}. (${q.type}) ${q.text}`)
    .join("\n");

  return [
    `시험 제목: ${exam.title}`,
    `시험 코드: ${exam.code}`,
    `시험 상태: ${exam.status}`,
    `시험 시간: ${exam.duration}분`,
    exam.description ? `시험 설명: ${exam.description}` : "",
    `문항 수: ${questions.length}`,
    questionsPreview ? `문항(일부):\n${questionsPreview}` : "",
    `학생 수: ${total} (완료 ${completed}, 진행중 ${inProgress}, 미시작 ${notStarted})`,
    `최종채점 완료: ${graded}`,
    `가채점 점수 보유: ${hasScores}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Student List Item Skeleton Component
function StudentListItemSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto flex-shrink-0">
        <div className="text-right min-w-[100px] sm:min-w-[120px] space-y-1">
          <Skeleton className="h-6 w-12 ml-auto" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <Skeleton className="h-8 w-16 sm:w-20" />
      </div>
    </div>
  );
}

// Student List Item Component
function StudentListItem({
  student,
  examId,
  onLiveMonitoring,
  getStudentStatusColor,
  showFinalScore,
  analyticsData,
}: {
  student: Student;
  examId: string;
  onLiveMonitoring: (student: Student) => void;
  getStudentStatusColor: (status: string) => string;
  showFinalScore: boolean;
  analyticsData?: {
    averageScore?: number;
    averageQuestions?: number;
    averageAnswerLength?: number;
    averageExamDuration?: number;
    standardDeviationScore?: number;
    standardDeviationQuestions?: number;
    standardDeviationAnswerLength?: number;
    standardDeviationExamDuration?: number;
  } | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-muted/50 transition-colors overflow-hidden">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <Avatar className="h-10 w-10 border flex-shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {student.name.slice(-2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium leading-none truncate">
              {student.name}
            </h4>
            <Badge
              variant="secondary"
              className={`text-xs font-normal flex-shrink-0 ${getStudentStatusColor(
                student.status
              )}`}
            >
              {student.status === "in-progress" && (
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-600"></span>
                </span>
              )}
              {student.status === "completed"
                ? "완료"
                : student.status === "in-progress"
                ? "진행 중"
                : "시작 안함"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1 truncate">
            {student.email}
          </div>
          {(student.student_number || student.school) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {student.student_number && <span>{student.student_number}</span>}
              {student.student_number && student.school && (
                <span className="text-muted-foreground/50">•</span>
              )}
              {student.school && <span>{student.school}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto flex-shrink-0">
        <div className="text-right min-w-[100px] sm:min-w-[120px]">
          {showFinalScore && student.finalScore !== undefined ? (
            <div className="flex flex-col items-end">
              <span className="font-semibold text-lg text-primary">
                {student.finalScore}점
              </span>
              <span className="text-xs text-muted-foreground">최종 점수</span>
            </div>
          ) : student.score !== undefined && student.score !== null ? (
            <div className="flex flex-col items-end">
              <span className="font-semibold text-lg">{student.score}점</span>
              <span className="text-xs text-muted-foreground">가채점</span>
              {student.status === "completed" && student.submittedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(student.submittedAt).toLocaleDateString("ko-KR")}
                </span>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {student.status === "in-progress" && (
            <AnimateIcon animateOnHover={true} loop={true} asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 h-8 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                onClick={() => onLiveMonitoring(student)}
              >
                <Radio size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">보기</span>
              </Button>
            </AnimateIcon>
          )}
          {student.status === "completed" && (
            <AnimateIcon
              animateOnHover={true}
              loop={true}
              loopDelay={700}
              asChild
            >
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 border-blue-600 hover:bg-blue-50 h-8 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                onClick={() => {
                  // 통계 데이터를 URL 쿼리 파라미터로 전달
                  const params = new URLSearchParams();
                  if (analyticsData) {
                    params.set("avgScore", String(analyticsData.averageScore || 0));
                    params.set("avgQuestions", String(analyticsData.averageQuestions || 0));
                    params.set("avgAnswerLength", String(analyticsData.averageAnswerLength || 0));
                    params.set("avgExamDuration", String(analyticsData.averageExamDuration || 0));
                    // 표준편차 추가
                    params.set("stdDevScore", String(analyticsData.standardDeviationScore || 0));
                    params.set("stdDevQuestions", String(analyticsData.standardDeviationQuestions || 0));
                    params.set("stdDevAnswerLength", String(analyticsData.standardDeviationAnswerLength || 0));
                    params.set("stdDevExamDuration", String(analyticsData.standardDeviationExamDuration || 0));
                  }
                  const queryString = params.toString();
                  window.location.href = `/instructor/${examId}/grade/${student.id}${queryString ? `?${queryString}` : ""}`;
                }}
              >
                <ClipboardCheck size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  {showFinalScore ? "재채점" : "채점"}
                </span>
              </Button>
            </AnimateIcon>
          )}
        </div>
      </div>
    </div>
  );
}
