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
import { UserMenu } from "@/components/auth/UserMenu";

interface ExamResult {
  id: string;
  examTitle: string;
  examCode: string;
  status: "completed" | "in-progress" | "not-started";
  score?: number;
  submittedAt?: string;
  duration: number;
  maxScore: number;
}

export default async function StudentDashboard() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const role = user.unsafeMetadata?.role as string;
  if (role !== "student") {
    redirect("/instructor");
  }

  // Mock data - replace with actual data from Supabase
  const mockExamResults: ExamResult[] = [
    {
      id: "1",
      examTitle: "수학 101 중간고사",
      examCode: "MATH101",
      status: "completed",
      score: 85,
      submittedAt: "2024-01-20",
      duration: 90,
      maxScore: 100,
    },
    {
      id: "2",
      examTitle: "물리학 퀴즈 1",
      examCode: "PHYS101",
      status: "completed",
      score: 92,
      submittedAt: "2024-01-18",
      duration: 45,
      maxScore: 100,
    },
    {
      id: "3",
      examTitle: "화학 기말고사",
      examCode: "CHEM101",
      status: "not-started",
      duration: 120,
      maxScore: 100,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-accent text-accent-foreground";
      case "in-progress":
        return "bg-secondary text-secondary-foreground";
      case "not-started":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-primary";
    if (score >= 80) return "text-accent-foreground";
    if (score >= 70) return "text-secondary-foreground";
    return "text-destructive";
  };

  const completedExams = mockExamResults.filter(
    (exam) => exam.status === "completed"
  );
  const averageScore =
    completedExams.length > 0
      ? Math.round(
          completedExams.reduce((sum, exam) => sum + (exam.score || 0), 0) /
            completedExams.length
        )
      : 0;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">학생 대시보드</h1>
            <p className="text-muted-foreground">
              환영합니다,{" "}
              {user.firstName || user.emailAddresses[0]?.emailAddress}님
            </p>
          </div>
          <UserMenu />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <Link href="/join">
          <Button size="lg">새로운 시험 코드 입력</Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 시험</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockExamResults.length}</div>
            <p className="text-xs text-muted-foreground">
              {completedExams.length}개 완료
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${getScoreColor(averageScore)}`}
            >
              {averageScore}%
            </div>
            <p className="text-xs text-muted-foreground">
              {completedExams.length}개 시험 기준
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">다음 시험</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockExamResults.find((exam) => exam.status === "not-started")
                ?.examCode || "없음"}
            </div>
            <p className="text-xs text-muted-foreground">시작 준비 완료</p>
          </CardContent>
        </Card>
      </div>

      {/* Exam History */}
      <Card>
        <CardHeader>
          <CardTitle>시험 기록</CardTitle>
          <CardDescription>모든 시험에서의 성과</CardDescription>
        </CardHeader>
        <CardContent>
          {mockExamResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 치른 시험이 없습니다.</p>
              <p>시험 코드를 입력하여 시작하세요!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mockExamResults.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold">{exam.examTitle}</h3>
                    <p className="text-sm text-muted-foreground">
                      코드: <span className="font-mono">{exam.examCode}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      시간: {exam.duration}분
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={getStatusColor(exam.status)}>
                      {exam.status === "completed"
                        ? "완료"
                        : exam.status === "in-progress"
                        ? "진행 중"
                        : "시작 안함"}
                    </Badge>
                    {exam.score && (
                      <div className="text-right">
                        <div
                          className={`text-lg font-bold ${getScoreColor(
                            exam.score
                          )}`}
                        >
                          {exam.score}/{exam.maxScore}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {exam.submittedAt}
                        </div>
                      </div>
                    )}
                    {exam.status === "not-started" && (
                      <Link href={`/exam/${exam.examCode}`}>
                        <Button size="sm">시험 시작</Button>
                      </Link>
                    )}
                    {exam.status === "completed" && (
                      <Link href={`/exam/${exam.examCode}/answer`}>
                        <Button variant="outline" size="sm">
                          피드백 보기
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
