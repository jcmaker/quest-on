/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExamDetailHeader } from "@/components/instructor/ExamDetailHeader";
import { ExamDetailsCard } from "@/components/instructor/ExamDetailsCard";
import { QuestionsListCard } from "@/components/instructor/QuestionsListCard";
import { StudentProgressCard } from "@/components/instructor/StudentProgressCard";

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
  submittedAt?: string;
  student_number?: string;
  school?: string;
}

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

  // Example student data for demonstration
  const exampleStudents: Student[] = [
    {
      id: "example-1",
      name: "Justin Cho",
      email: "jcmaker0627@gmail.com",
      status: "completed",
      // score: 85,
      submittedAt: "2024-01-20",
    },
  ];

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

        // Fetch exam details
        console.log("Fetching exam details for ID:", resolvedParams.examId);
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

        if (!examResponse.ok) {
          const errorText = await examResponse.text();
          console.error("API Error Response:", errorText);
          throw new Error(
            `Failed to fetch exam details: ${examResponse.status} ${examResponse.statusText}`
          );
        }

        const examResult = await examResponse.json();

        // Fetch actual student submissions
        const sessionsResponse = await fetch(
          `/api/exam/${resolvedParams.examId}/sessions`
        );
        let students = exampleStudents; // fallback to example data

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
              };
            }
          );

          // 학생 목록 정렬: 제출 완료한 학생 먼저, 그 다음 진행 중인 학생
          students.sort((a, b) => {
            // 제출 완료한 학생을 먼저
            if (a.status === "completed" && b.status !== "completed") {
              return -1;
            }
            if (a.status !== "completed" && b.status === "completed") {
              return 1;
            }
            // 같은 상태면 이름순으로 정렬
            return a.name.localeCompare(b.name);
          });
        }

        setExam({
          id: examResult.exam.id,
          title: examResult.exam.title,
          code: examResult.exam.code,
          description: examResult.exam.description,
          duration: examResult.exam.duration,
          status: examResult.exam.status,
          createdAt: examResult.exam.created_at,
          questions: examResult.exam.questions || [],
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
          <Link href="/instructor/exams" className="inline-block mt-4">
            <Button variant="outline">시험 목록으로 돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <ExamDetailHeader title={exam.title} code={exam.code} examId={exam.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ExamDetailsCard
            description={exam.description}
            duration={exam.duration}
            createdAt={exam.createdAt}
            examCode={exam.code}
          />

          <QuestionsListCard questions={exam.questions} />
        </div>

        <div className="space-y-6">
          <StudentProgressCard students={exam.students} examId={exam.id} />
        </div>
      </div>
    </div>
  );
}
