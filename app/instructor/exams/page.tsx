"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  FileText,
  Users,
  Settings,
  Plus,
  Edit,
  Eye,
  Copy,
  Trash2,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function ExamManagement() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Redirect non-instructors
  useEffect(() => {
    if (isLoaded && isSignedIn && userRole !== "instructor") {
      router.push("/student");
    }
  }, [isLoaded, isSignedIn, userRole, router]);

  // Fetch exams from database
  useEffect(() => {
    const fetchExams = async () => {
      if (!isSignedIn || userRole !== "instructor") return;

      try {
        const response = await fetch("/api/supa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "get_instructor_exams",
          }),
        });

        if (response.ok) {
          const result = await response.json();
          setExams(result.exams || []);
        } else {
          console.error("Failed to fetch exams");
        }
      } catch (error) {
        console.error("Error fetching exams:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchExams();
  }, [isSignedIn, userRole]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200";
      case "draft":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "completed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "진행중";
      case "draft":
        return "초안";
      case "completed":
        return "완료";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen">
          <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-xl">로그인이 필요합니다</CardTitle>
              <p className="text-sm text-muted-foreground">
                시험 관리 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full"
              >
                강사로 로그인
              </Button>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Header */}
        <header className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    시험 관리
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    기존 시험을 편집하고 관리하세요
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Link href="/instructor">
                  <Button variant="outline" size="sm">
                    대시보드로
                  </Button>
                </Link>
                <Link href="/instructor/new">
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />새 시험 만들기
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-muted-foreground">총 시험</span>
                </div>
                <p className="text-2xl font-bold">{exams.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-muted-foreground">진행중</span>
                </div>
                <p className="text-2xl font-bold">
                  {exams.filter((exam) => exam.status === "active").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm text-muted-foreground">초안</span>
                </div>
                <p className="text-2xl font-bold">
                  {exams.filter((exam) => exam.status === "draft").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-muted-foreground">총 학생</span>
                </div>
                <p className="text-2xl font-bold">
                  {exams.reduce(
                    (sum, exam) => sum + (exam.student_count || 0),
                    0
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Exam List */}
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-primary" />
                <span>내 시험 목록</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">
                    시험 목록을 불러오는 중...
                  </p>
                </div>
              ) : exams.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    아직 시험이 없습니다
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    첫 번째 시험을 만들어 시작하세요!
                  </p>
                  <Link href="/instructor/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />새 시험 만들기
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {exams.map((exam) => (
                    <div
                      key={exam.id}
                      className="flex items-center justify-between p-6 border rounded-xl hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold">
                            {exam.title}
                          </h3>
                          <Badge className={getStatusColor(exam.status)}>
                            {getStatusText(exam.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                              {exam.code}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>{exam.duration}분</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Users className="w-4 h-4" />
                            <span>{exam.student_count || 0}명 참여</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {new Date(exam.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link href={`/instructor/${exam.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            보기
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm">
                          <Edit className="w-4 h-4 mr-1" />
                          편집
                        </Button>
                        <Button variant="outline" size="sm">
                          <Copy className="w-4 h-4 mr-1" />
                          복사
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          삭제
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </SignedIn>
    </div>
  );
}
