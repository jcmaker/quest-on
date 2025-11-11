"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  MessageCircle,
  Award,
  TrendingUp,
} from "lucide-react";

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
  ai_feedback: unknown;
  student_reply: string | null;
  created_at: string;
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
}

interface ReportData {
  session: {
    id: string;
    exam_id: string;
    student_id: string;
    submitted_at: string;
    used_clarifications: number;
    created_at: string;
  };
  exam: {
    id: string;
    title: string;
    code: string;
    questions: Question[];
  };
  submissions: Record<number, Submission>;
  messages: Record<
    number,
    Array<{ role: string; content: string; created_at: string }>
  >;
  grades: Record<number, Grade>;
  overallScore: number | null;
}

export default function StudentReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useUser();
  const sessionId = params.sessionId as string;

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/student/session/${sessionId}/report`);

      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          setError("리포트를 찾을 수 없습니다.");
        } else {
          setError("리포트를 불러오는 중 오류가 발생했습니다.");
        }
        return;
      }

      const data: ReportData = await response.json();

      // Check if graded
      if (!data.grades || Object.keys(data.grades).length === 0) {
        setError("아직 평가가 완료되지 않았습니다.");
        return;
      }

      setReportData(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      setError("리포트를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "student") {
      router.push("/student");
      return;
    }

    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user, sessionId, router]);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600 dark:text-green-400";
    if (score >= 80) return "text-blue-600 dark:text-blue-400";
    if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (!isLoaded || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "student") {
    return null;
  }

  if (error || !reportData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            {error || "리포트를 불러올 수 없습니다"}
          </h2>
          <Link href="/student">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              학생 대시보드로 돌아가기
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = reportData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = reportData.submissions?.[selectedQuestionIdx];
  const currentGrade = reportData.grades?.[selectedQuestionIdx];
  const currentMessages = reportData.messages?.[selectedQuestionIdx] || [];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/student")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            대시보드로 돌아가기
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{reportData.exam.title}</h1>
            <p className="text-muted-foreground mt-2">
              제출일:{" "}
              {new Date(reportData.session.submitted_at).toLocaleString(
                "ko-KR"
              )}
            </p>
            {reportData.overallScore !== null && (
              <div className="flex items-center gap-2 mt-3">
                <Award className="w-5 h-5 text-primary" />
                <p
                  className={`text-2xl font-bold ${getScoreColor(
                    reportData.overallScore
                  )}`}
                >
                  전체 점수: {reportData.overallScore}점
                </p>
              </div>
            )}
          </div>
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            평가 완료
          </Badge>
        </div>
      </div>

      {/* Question Navigation */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap">
          {reportData.exam?.questions &&
          Array.isArray(reportData.exam.questions) ? (
            reportData.exam.questions.map((question, idx) => {
              const grade = reportData.grades[idx];
              return (
                <Button
                  key={question.id || idx}
                  variant={selectedQuestionIdx === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedQuestionIdx(idx)}
                >
                  문제 {idx + 1}
                  {grade && (
                    <Badge
                      variant="secondary"
                      className={`ml-2 ${getScoreColor(
                        grade.score
                      )} bg-opacity-20`}
                    >
                      {grade.score}점
                    </Badge>
                  )}
                </Button>
              );
            })
          ) : (
            <div className="text-red-600">문제를 불러올 수 없습니다.</div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Question */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                문제 {selectedQuestionIdx + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextViewer
                content={currentQuestion?.prompt || ""}
                className="text-base leading-relaxed"
              />
            </CardContent>
          </Card>

          {/* Chat History */}
          {currentMessages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-purple-600" />
                  AI와 나눈 대화
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {currentMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 max-w-[70%]">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          <p className="text-xs mt-2 opacity-70">
                            {new Date(msg.created_at).toLocaleTimeString(
                              "ko-KR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </p>
                        </div>
                      ) : (
                        <AIMessageRenderer
                          content={msg.content}
                          timestamp={msg.created_at}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Student Answer */}
          <Card>
            <CardHeader>
              <CardTitle>내 답안</CardTitle>
            </CardHeader>
            <CardContent>
              {currentSubmission ? (
                <RichTextViewer
                  content={currentSubmission.answer}
                  className="text-base leading-relaxed whitespace-pre-wrap"
                />
              ) : (
                <p className="text-muted-foreground">제출된 답안이 없습니다.</p>
              )}
            </CardContent>
          </Card>

          {/* Student Reply to Feedback */}
          {currentSubmission?.student_reply && (
            <Card>
              <CardHeader>
                <CardTitle>피드백에 대한 답변</CardTitle>
              </CardHeader>
              <CardContent>
                <RichTextViewer
                  content={currentSubmission.student_reply}
                  className="text-base leading-relaxed whitespace-pre-wrap"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Grade Card */}
          {currentGrade && (
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  평가 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">점수</p>
                  <p
                    className={`text-3xl font-bold ${getScoreColor(
                      currentGrade.score
                    )}`}
                  >
                    {currentGrade.score}점
                  </p>
                </div>
                {currentGrade.comment && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      강사 평가
                    </p>
                    <div className="bg-muted p-3 rounded-lg">
                      <RichTextViewer
                        content={currentGrade.comment}
                        className="text-sm leading-relaxed"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Exam Info */}
          <Card>
            <CardHeader>
              <CardTitle>시험 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">시험 코드:</span>
                <span className="ml-2 font-mono">{reportData.exam.code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">제출 일시:</span>
                <span className="ml-2">
                  {new Date(reportData.session.submitted_at).toLocaleString(
                    "ko-KR"
                  )}
                </span>
              </div>
              {reportData.session.used_clarifications > 0 && (
                <div>
                  <span className="text-muted-foreground">질문 횟수:</span>
                  <span className="ml-2">
                    {reportData.session.used_clarifications}회
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
