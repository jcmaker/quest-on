import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
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
import { UserMenu } from "@/components/auth/UserMenu";

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

export default async function ExamDetail({
  params,
}: {
  params: { examId: string };
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const role = user.unsafeMetadata?.role as string;
  if (role !== "instructor") {
    redirect("/student");
  }

  // Mock data - replace with actual data from Supabase
  const mockExam: Exam = {
    id: params.examId,
    title: "수학 101 중간고사",
    code: "MATH101",
    description: "대수학과 미적분학을 다루는 종합적인 중간고사",
    duration: 90,
    status: "active",
    createdAt: "2024-01-15",
    questions: [
      {
        id: "1",
        text: "이차방정식을 풀어라: x² + 5x + 6 = 0",
        type: "essay",
      },
      {
        id: "2",
        text: "f(x) = x³ + 2x² - 5x + 1의 도함수를 구하라",
        type: "essay",
      },
      { id: "3", text: "적분을 계산하라: ∫(2x + 3)dx", type: "essay" },
    ],
    students: [
      {
        id: "1",
        name: "김철수",
        email: "kim@example.com",
        status: "completed",
        score: 85,
        submittedAt: "2024-01-20",
      },
      {
        id: "2",
        name: "이영희",
        email: "lee@example.com",
        status: "in-progress",
      },
      {
        id: "3",
        name: "박민수",
        email: "park@example.com",
        status: "not-started",
      },
    ],
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "draft":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{mockExam.title}</h1>
            <p className="text-muted-foreground">
              시험 코드: <span className="font-mono">{mockExam.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/instructor">
              <Button variant="outline">대시보드로 돌아가기</Button>
            </Link>
            <Button>시험 편집</Button>
            <UserMenu />
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
                  {mockExam.description}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">시간</Label>
                  <p className="text-sm text-muted-foreground">
                    {mockExam.duration}분
                  </p>
                </div>
                <div>
                  <Label className="font-medium">상태</Label>
                  <Badge className={getStatusColor(mockExam.status)}>
                    {mockExam.status === "active"
                      ? "활성"
                      : mockExam.status === "draft"
                      ? "초안"
                      : mockExam.status === "completed"
                      ? "완료"
                      : mockExam.status}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="font-medium">생성일</Label>
                <p className="text-sm text-muted-foreground">
                  {mockExam.createdAt}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>문제 ({mockExam.questions.length})</CardTitle>
              <CardDescription>시험 문제 검토 및 편집</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockExam.questions.map((question, index) => (
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
                ))}
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
              <CardTitle>학생 진행 상황 ({mockExam.students.length})</CardTitle>
              <CardDescription>학생 참여도와 점수 모니터링</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockExam.students.map((student) => (
                  <div key={student.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{student.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {student.email}
                        </p>
                      </div>
                      <Badge className={getStudentStatusColor(student.status)}>
                        {student.status === "completed"
                          ? "완료"
                          : student.status === "in-progress"
                          ? "진행 중"
                          : "시작 안함"}
                      </Badge>
                    </div>
                    {student.score && (
                      <div className="flex items-center justify-between text-sm">
                        <span>점수: {student.score}%</span>
                        <span className="text-muted-foreground">
                          제출: {student.submittedAt}
                        </span>
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
