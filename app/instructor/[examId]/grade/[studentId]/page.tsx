"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState, useEffect, use } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  FileText,
  CheckCircle,
  User,
  Bot,
  Star,
} from "lucide-react";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}

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
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
  decompressed?: {
    answerData?: Record<string, unknown>;
    feedbackData?: Record<string, unknown>;
  };
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
}

interface SessionData {
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
  student: {
    name: string;
    email: string;
  };
  submissions: Record<string, Submission>;
  messages: Record<string, Conversation[]>;
  grades: Record<string, Grade>;
  overallScore: number | null;
}

export default function GradeStudentPage({
  params,
}: {
  params: Promise<{ examId: string; studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user } = useUser();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number>(0);

  // Redirect non-instructors
  useEffect(() => {
    if (
      isLoaded &&
      (!isSignedIn || (user?.unsafeMetadata?.role as string) !== "instructor")
    ) {
      redirect("/student");
    }
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    const fetchSessionData = async () => {
      try {
        setLoading(true);
        // studentId is actually sessionId in the URL
        const response = await fetch(
          `/api/session/${resolvedParams.studentId}/grade`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch session data");
        }

        const data: SessionData = await response.json();

        // Debug logging
        console.log("📊 Fetched session data:", data);
        console.log("📝 Exam questions:", data.exam?.questions);
        console.log("💬 Messages:", data.messages);
        console.log("📤 Submissions:", data.submissions);

        setSessionData(data);

        // Initialize scores and feedbacks from existing grades
        const initialScores: Record<number, number> = {};
        const initialFeedbacks: Record<number, string> = {};

        Object.entries(data.grades).forEach(([qIdx, grade]) => {
          initialScores[parseInt(qIdx)] = grade.score;
          initialFeedbacks[parseInt(qIdx)] = grade.comment || "";
        });

        setScores(initialScores);
        setFeedbacks(initialFeedbacks);
      } catch (error) {
        console.error("Error fetching session data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [resolvedParams.studentId]);

  const handleSaveGrade = async (questionIdx: number) => {
    try {
      setSaving(true);
      const response = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionIdx,
            score: scores[questionIdx] || 0,
            comment: feedbacks[questionIdx] || "",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save grade");
      }

      // Refresh data to get updated overall score
      const refreshResponse = await fetch(
        `/api/session/${resolvedParams.studentId}/grade`
      );
      if (refreshResponse.ok) {
        const data: SessionData = await refreshResponse.json();
        setSessionData(data);
      }

      alert("채점이 저장되었습니다.");
    } catch (error) {
      console.error("Error saving grade:", error);
      alert("채점 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

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

  // Don't render anything if not authorized
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

  if (!sessionData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            제출물을 찾을 수 없습니다
          </h2>
          <Link href={`/instructor/${resolvedParams.examId}`}>
            <Button variant="outline">돌아가기</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get current question data
  const currentQuestion = sessionData.exam?.questions?.[selectedQuestionIdx];
  const currentSubmission = sessionData.submissions?.[selectedQuestionIdx] as
    | Submission
    | undefined;

  // Try to get messages by both index and question.id (for backward compatibility)
  let currentMessages = (sessionData.messages?.[selectedQuestionIdx] ||
    []) as Conversation[];

  // If no messages found by index, try using question.id
  if (currentMessages.length === 0 && currentQuestion?.id) {
    currentMessages = (sessionData.messages?.[currentQuestion.id] ||
      []) as Conversation[];
  }

  // Debug logging for current data
  console.log("🔍 Current question index:", selectedQuestionIdx);
  console.log("❓ Current question:", currentQuestion);
  console.log("❓ Current question ID:", currentQuestion?.id);
  console.log("📤 Current submission:", currentSubmission);
  console.log("💬 Current messages:", currentMessages);
  console.log("💬 All messages keys:", Object.keys(sessionData.messages || {}));

  // Separate messages into AI conversations (before submission) and feedback conversations (after submission)
  const aiConversations = currentMessages.filter(
    (msg) => msg.role === "user" || msg.role === "ai"
  );

  // For now, we'll assume all messages are AI conversations during the exam
  // In a real implementation, you might have a flag or timestamp to distinguish
  const duringExamMessages = aiConversations;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href={`/instructor/${resolvedParams.examId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              시험으로 돌아가기
            </Button>
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {sessionData.student.name} 학생 채점
            </h1>
            <p className="text-muted-foreground">
              제출일:{" "}
              {new Date(sessionData.session.submitted_at).toLocaleString()}
            </p>
            {sessionData.overallScore !== null && (
              <p className="text-lg font-semibold mt-2">
                전체 점수: {sessionData.overallScore}점
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              제출 완료
            </Badge>
          </div>
        </div>
      </div>

      {/* Question Navigation */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap">
          {sessionData.exam?.questions &&
          Array.isArray(sessionData.exam.questions) ? (
            sessionData.exam.questions.map((question, idx) => (
              <Button
                key={question.id || idx}
                variant={selectedQuestionIdx === idx ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedQuestionIdx(idx)}
              >
                문제 {idx + 1}
                {sessionData.grades[idx] && (
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-green-100 text-green-800"
                  >
                    {sessionData.grades[idx]?.score || 0}점
                  </Badge>
                )}
              </Button>
            ))
          ) : (
            <div className="text-red-600">문제를 불러올 수 없습니다.</div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Conversations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Question Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                문제 {selectedQuestionIdx + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentQuestion ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">
                    {currentQuestion.prompt}
                  </p>
                  {currentQuestion.ai_context && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-2">AI 컨텍스트:</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {currentQuestion.ai_context}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-red-600">
                  <p>❌ 문제를 불러올 수 없습니다.</p>
                  <p className="text-sm mt-2 text-gray-600">
                    선택된 문제 인덱스: {selectedQuestionIdx}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                AI와의 대화 기록
              </CardTitle>
              <CardDescription>
                학생이 AI와 나눈 대화 내용입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              {duringExamMessages.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {duringExamMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex gap-2 max-w-[80%] ${
                          message.role === "user"
                            ? "flex-row-reverse"
                            : "flex-row"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            message.role === "user"
                              ? "bg-blue-600"
                              : "bg-gray-600"
                          }`}
                        >
                          {message.role === "user" ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div
                          className={`rounded-lg p-3 ${
                            message.role === "user"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </p>
                          <p className="text-xs mt-1 opacity-70">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>AI와의 대화 기록이 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Final Answer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                최종 답안
              </CardTitle>
              <CardDescription>학생이 제출한 최종 답안입니다</CardDescription>
            </CardHeader>
            <CardContent>
              {currentSubmission ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">
                    {String(currentSubmission.answer || "답안이 없습니다.")}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>제출된 답안이 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Feedback from submission */}
          {currentSubmission?.ai_feedback && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                  AI 피드백
                </CardTitle>
                <CardDescription>
                  학생 답안에 대한 AI의 자동 피드백입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-indigo-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">
                    {typeof currentSubmission.ai_feedback === "string"
                      ? currentSubmission.ai_feedback
                      : JSON.stringify(currentSubmission.ai_feedback, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Student Reply to AI Feedback */}
          {currentSubmission?.student_reply && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-green-600" />
                  학생의 반박 답변
                </CardTitle>
                <CardDescription>
                  AI 피드백에 대한 학생의 응답입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-green-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-900">
                    {currentSubmission.student_reply}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Grading Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-600" />
                문제 {selectedQuestionIdx + 1} 채점
              </CardTitle>
              <CardDescription>
                이 문제에 대한 점수와 피드백을 입력하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Score Input */}
              <div>
                <Label htmlFor="score" className="text-sm font-medium">
                  점수 (0-100)
                </Label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="score"
                    min="0"
                    max="100"
                    value={scores[selectedQuestionIdx] || 0}
                    onChange={(e) =>
                      setScores({
                        ...scores,
                        [selectedQuestionIdx]: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <Separator />

              {/* Feedback Input */}
              <div>
                <Label htmlFor="feedback" className="text-sm font-medium">
                  피드백 및 평가
                </Label>
                <Textarea
                  id="feedback"
                  value={feedbacks[selectedQuestionIdx] || ""}
                  onChange={(e) =>
                    setFeedbacks({
                      ...feedbacks,
                      [selectedQuestionIdx]: e.target.value,
                    })
                  }
                  placeholder="학생의 답안에 대한 상세한 피드백을 입력하세요..."
                  className="mt-1 min-h-[120px] resize-none"
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={() => handleSaveGrade(selectedQuestionIdx)}
                disabled={saving}
                className="w-full"
              >
                {saving ? "저장 중..." : "문제 채점 저장"}
              </Button>

              {sessionData.grades[selectedQuestionIdx] && (
                <div className="text-sm text-green-600 text-center">
                  ✓ 채점 완료됨
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">빠른 작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <FileText className="w-4 h-4 mr-2" />
                답안 PDF 다운로드
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                학생에게 메시지
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
