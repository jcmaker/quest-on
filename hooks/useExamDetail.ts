"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { InstructorExam, InstructorStudent } from "@/lib/types/exam";

interface Question {
  id: string;
  text: string;
  type: string;
}

interface UseExamDetailOptions {
  examId: string;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | undefined;
}

export function useExamDetail({
  examId,
  isLoaded,
  isSignedIn,
}: UseExamDetailOptions) {
  const [exam, setExam] = useState<InstructorExam | null>(null);

  const { data: examDetailData, isLoading: examDetailLoading, error: examDetailError } = useQuery({
    queryKey: qk.instructor.examDetail(examId),
    queryFn: async () => {
      const [examResponse, sessionsResponse] = await Promise.all([
        fetch("/api/supa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_exam_by_id",
            data: { id: examId },
          }),
        }),
        fetch(`/api/exam/${examId}/sessions`),
      ]);

      if (!examResponse.ok) {
        throw new Error(
          `Failed to fetch exam details: ${examResponse.status} ${examResponse.statusText}`
        );
      }

      const examResult = await examResponse.json();
      const questionsArray = examResult.exam.questions || [];
      let students: InstructorStudent[] = [];

      if (sessionsResponse.ok) {
        const sessionsResult = await sessionsResponse.json();
        const sessionsByStudent = new Map<string, Array<Record<string, unknown>>>();

        const ACTIVE_STATUSES = ['in_progress', 'submitted', 'auto_submitted'];
        sessionsResult.sessions
          .filter((session: Record<string, unknown>) => {
            const status = typeof session.status === 'string' ? session.status : '';
            return ACTIVE_STATUSES.includes(status);
          })
          .forEach((session: Record<string, unknown>) => {
          const studentId =
            typeof session.student_id === "string" ? session.student_id : "";
          if (!sessionsByStudent.has(studentId)) {
            sessionsByStudent.set(studentId, []);
          }
          sessionsByStudent.get(studentId)?.push(session);
        });

        students = Array.from(sessionsByStudent.entries()).map(
          ([studentId, sessions]) => {
            const submittedSessions = sessions
              .filter((s) => s.submitted_at != null)
              .sort((a, b) => {
                const aDate = a.submitted_at ? new Date(a.submitted_at as string).getTime() : 0;
                const bDate = b.submitted_at ? new Date(b.submitted_at as string).getTime() : 0;
                return bDate - aDate;
              });

            const unsubmittedSessions = sessions
              .filter((s) => s.submitted_at == null)
              .sort((a, b) => {
                const aDate = a.created_at ? new Date(a.created_at as string).getTime() : 0;
                const bDate = b.created_at ? new Date(b.created_at as string).getTime() : 0;
                return bDate - aDate;
              });

            const selectedSession =
              submittedSessions.length > 0
                ? submittedSessions[0]
                : unsubmittedSessions.length > 0
                ? unsubmittedSessions[0]
                : sessions[0];

            const sessionId = typeof selectedSession.id === "string" ? selectedSession.id : "";
            const submittedAt =
              selectedSession.submitted_at != null
                ? typeof selectedSession.submitted_at === "string"
                  ? selectedSession.submitted_at
                  : String(selectedSession.submitted_at)
                : undefined;

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
              id: sessionId,
              name: studentName,
              email: studentEmail,
              status: submittedAt ? "completed" : "in-progress",
              score: undefined,
              finalScore: undefined,
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
              questionCount: undefined,
              answerLength: undefined,
              isGraded: false,
            } as InstructorStudent;
          }
        );
      }

      return {
        exam: {
          id: examResult.exam.id,
          title: examResult.exam.title,
          code: examResult.exam.code,
          description: examResult.exam.description,
          duration: examResult.exam.duration,
          status: examResult.exam.status,
          createdAt: examResult.exam.created_at,
          questions: [],
          students,
          open_at: examResult.exam.open_at || null,
          close_at: examResult.exam.close_at || null,
          started_at: examResult.exam.started_at || null,
          deadline: examResult.exam.deadline || null,
          assignment_prompt: examResult.exam.assignment_prompt || null,
          grades_released: examResult.exam.grades_released || false,
        } as InstructorExam,
        questionsCount: questionsArray.length,
        questionsRaw: questionsArray as Question[],
      };
    },
    enabled: !!examId,
  });

  const loading = examDetailLoading || (!exam && !examDetailError);
  const error = examDetailError instanceof Error
    ? examDetailError.message
    : examDetailError
    ? "Failed to load exam data"
    : null;

  useEffect(() => {
    setExam(null);
  }, [examId]);

  useEffect(() => {
    if (!examDetailData?.exam) return;
    setExam((prev) => {
      if (!prev) return examDetailData.exam;               // 최초 로드
      // refetch: students를 갱신하되, 기존 score/finalScore 등 analytics 데이터 보존
      const mergedStudents = examDetailData.exam.students.map((newStudent) => {
        const existing = prev.students.find((s) => s.id === newStudent.id);
        if (!existing) return newStudent;
        return {
          ...newStudent,
          score: existing.score ?? newStudent.score,
          finalScore: existing.finalScore ?? newStudent.finalScore,
          isGraded: existing.isGraded || newStudent.isGraded,
          gradeType: existing.gradeType ?? newStudent.gradeType,
          aiComment: existing.aiComment ?? newStudent.aiComment,
          questionCount: existing.questionCount ?? newStudent.questionCount,
          answerLength: existing.answerLength ?? newStudent.answerLength,
        };
      });
      return { ...prev, students: mergedStudents, grades_released: examDetailData.exam.grades_released };
    });
  }, [examDetailData]);

  // Final grades
  const { data: finalGradesData } = useQuery({
    queryKey: qk.instructor.finalGrades(examId),
    queryFn: async () => {
      const response = await fetch(`/api/exam/${examId}/final-grades`).catch(() => null);
      if (!response?.ok) return null;
      return response.json();
    },
    enabled: !!exam && exam.students.length > 0,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!finalGradesData?.grades) return;

    const finalGradesMap = new Map<
      string,
      { score: number; gradeStatus?: string; aiComment?: string | null }
    >();
    finalGradesData.grades.forEach(
      (g: { session_id: string; score: number; gradeStatus?: string; aiComment?: string | null }) => {
        finalGradesMap.set(g.session_id, g);
      }
    );

    setExam((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        students: prev.students.map((student) => {
          const gradeData = finalGradesMap.get(student.id);
          if (!gradeData) return student;
          const isManuallyGraded = gradeData.gradeStatus === "manually_graded";
          return {
            ...student,
            score: gradeData.score ?? student.score,
            finalScore: isManuallyGraded ? gradeData.score : student.finalScore,
            isGraded: isManuallyGraded,
            gradeType: (gradeData.gradeStatus as InstructorStudent["gradeType"]) ?? student.gradeType,
            aiComment: gradeData.aiComment ?? student.aiComment,
          };
        }),
      };
    });
  }, [finalGradesData]);

  // 시험 종료 후 아직 가채점 안 된 학생이 있으면 폴링
  const hasUngradedStudents = useMemo(() => {
    if (!exam || exam.status !== "closed") return false;
    return exam.students.some(
      (s) => s.status === "completed" && (s.score === undefined || s.score === null)
    );
  }, [exam]);

  // Analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: qk.instructor.examAnalytics(examId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/analytics/exam/${examId}/overview`, { signal });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
    enabled: !!examId && isLoaded && isSignedIn && !!exam && exam.students.length > 0,
    staleTime: hasUngradedStudents ? 0 : 30000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: hasUngradedStudents ? 10000 : false,
  });

  // Update student scores from analytics
  useEffect(() => {
    if (!exam || !analyticsData || exam.students.length === 0) return;

    const analyticsStudentsMap = analyticsData.students
      ? new Map(analyticsData.students.map((s: Record<string, unknown>) => [s.sessionId, s]))
      : new Map();

    setExam((prev) => {
      if (!prev) return prev;
      const updatedStudents = prev.students.map((student) => {
        const analyticsStudent = analyticsStudentsMap.get(student.id) as Record<string, unknown> | undefined;
        return {
          ...student,
          score:
            analyticsStudent?.score !== null && analyticsStudent?.score !== undefined
              ? analyticsStudent.score as number
              : student.score,
          questionCount:
            analyticsStudent?.questionCount !== null && analyticsStudent?.questionCount !== undefined
              ? analyticsStudent.questionCount as number
              : student.questionCount,
          answerLength:
            analyticsStudent?.answerLength !== null && analyticsStudent?.answerLength !== undefined
              ? analyticsStudent.answerLength as number
              : student.answerLength,
        };
      });
      return { ...prev, students: updatedStudents };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when analyticsData or exam identity changes, uses setExam functional updater
  }, [analyticsData, exam?.id]);

  return {
    exam,
    setExam,
    examDetailData,
    examDetailLoading,
    examDetailError,
    loading,
    error,
    analyticsData,
    analyticsLoading,
    finalGradesData,
  };
}
