/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use } from "react";
import { FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Label } from "@/components/ui/label";

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
          students = sessionsResult.sessions.map(
            (session: Record<string, unknown>) => {
              const studentId =
                typeof session.student_id === "string"
                  ? session.student_id
                  : "";
              const submittedAt = session.submitted_at ?? null;
              return {
                id: studentId,
                name: `Student ${studentId.slice(0, 8)}`, // Generate name from ID
                email: `${studentId}@example.com`,
                status: submittedAt ? "completed" : "in-progress",
                submittedAt: submittedAt,
              };
            }
          );
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

  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case "active":
  //       return "bg-green-100 text-green-800";
  //     case "draft":
  //       return "bg-yellow-100 text-yellow-800";
  //     case "completed":
  //       return "bg-blue-100 text-blue-800";
  //     default:
  //       return "bg-gray-100 text-gray-800";
  //   }
  // };

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

  // const getTimeElapsed = (startedAt: string) => {
  //   const startTime = new Date(startedAt);
  //   const now = new Date();
  //   const elapsed = Math.floor(
  //     (now.getTime() - startTime.getTime()) / (1000 * 60)
  //   ); // 분 단위

  //   if (elapsed < 60) {
  //     return `${elapsed}분`;
  //   } else {
  //     const hours = Math.floor(elapsed / 60);
  //     const minutes = elapsed % 60;
  //     return `${hours}시간 ${minutes}분`;
  //   }
  // };

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
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{exam.title}</h1>
            <p className="text-muted-foreground">
              시험 코드: <span className="font-mono">{exam.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/instructor">
              <Button variant="outline">대시보드로 돌아가기</Button>
            </Link>
            <Button>시험 편집</Button>
            {/* <UserMenu /> */}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Exam Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>시험 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="font-medium">설명</Label>
                <p className="text-sm text-muted-foreground">
                  {exam.description}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">시간</Label>
                  <p className="text-sm text-muted-foreground">
                    {exam.duration}분
                  </p>
                </div>
                <div>
                  {/* <Label className="font-medium">상태</Label> */}
                  {/* <Badge className={getStatusColor(exam.status)}>
                    {exam.status === "active"
                      ? "활성"
                      : exam.status === "draft"
                      ? "초안"
                      : exam.status === "completed"
                      ? "완료"
                      : exam.status}
                  </Badge> */}
                </div>
              </div>
              <div>
                <Label className="font-medium">생성일</Label>
                <p className="text-sm text-muted-foreground">
                  {new Date(exam.createdAt).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>문제 ({exam.questions.length})</CardTitle>
              <CardDescription>시험 문제 검토 및 편집</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {exam.questions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>등록된 문제가 없습니다.</p>
                  </div>
                ) : (
                  exam.questions.map((question, index) => (
                    <div key={question.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">문제 {index + 1}</h4>
                        <Badge variant="outline">
                          {question.type === "essay"
                            ? "서술형"
                            : question.type === "short-answer"
                            ? "단답형"
                            : question.type === "multiple-choice"
                            ? "객관식"
                            : question.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {question.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4">
                <Button variant="outline" size="sm">
                  문제 추가
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Progress */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>학생 진행 상황 ({exam.students.length})</CardTitle>
              <CardDescription>학생 참여도와 점수 모니터링</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {exam.students.map((student) => (
                  <div key={student.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{student.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {student.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={getStudentStatusColor(student.status)}
                        >
                          {student.status === "completed"
                            ? "완료"
                            : student.status === "in-progress"
                            ? "진행 중"
                            : "시작 안함"}
                        </Badge>
                        {student.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 border-blue-600 hover:bg-blue-50"
                            onClick={() =>
                              (window.location.href = `/instructor/${exam.id}/grade/${student.id}`)
                            }
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            채점하기
                          </Button>
                        )}
                      </div>
                    </div>
                    {student.score && (
                      <div className="flex items-center justify-between text-sm">
                        <span>점수: {student.score}%</span>
                        <span className="text-muted-foreground">
                          제출: {student.submittedAt}
                        </span>
                      </div>
                    )}
                    {student.status === "in-progress" && student && (
                      <div className="text-sm text-muted-foreground">
                        {/* 시작한 지: {getTimeElapsed(student.id)} */}
                        시작한 지: 00시간 17분
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>빠른 작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="outline">
                시험 코드 공유
              </Button>
              <Button className="w-full" variant="outline">
                결과 다운로드
              </Button>
              <Button className="w-full" variant="outline">
                분석 보기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
