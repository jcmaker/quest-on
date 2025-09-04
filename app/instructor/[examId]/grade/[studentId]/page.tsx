/* eslint-disable react-hooks/exhaustive-deps */
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
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface StudentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  finalAnswer: string;
  feedback: string;
  score?: number;
  aiConversations: Conversation[];
  submittedAt: string;
}

export default function GradeStudentPage({
  params,
}: {
  params: Promise<{ examId: string; studentId: string }>;
}) {
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded, user } = useUser();

  const [submission, setSubmission] = useState<StudentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Mock data for demonstration
  const mockSubmission: StudentSubmission = {
    id: resolvedParams.studentId,
    studentId: resolvedParams.studentId,
    studentName: "Justin Cho",
    finalAnswer:
      "Project A:\n• NPV +$153M, IRR 11.5%\n• 안정적 Cash Flow, 큰 Risk 없음\n\nProject B:\n• NPV +$182M, IRR 14.2%\n• Growth Option 존재, 경쟁사 대비 전략적 필요\n• Debt 50% 활용 시 WACC 낮아지고 배당 안정성 유지 가능\n\n결론:\n• B 선택\n• 이유: 재무적 성과 우수, 전략적 성장 옵션, 자본조달 방식으로 리스크 관리 가능",
    feedback:
      "프로젝트 평가에 대한 답안이 매우 체계적이고 전문적으로 작성되었습니다. NPV, IRR 등 주요 재무 지표를 적절히 활용하였으며, 현금흐름 안정성과 리스크 요인을 고려한 분석이 돋보입니다. 다만, 구체적인 자금조달 방식과 배당 정책에 대한 세부적인 수치 분석이 추가되면 더 완벽한 평가가 될 것입니다.",
    score: 85,
    aiConversations: [
      {
        id: "1",
        role: "user",
        content: "두 기업의 5년 예상 cash flow를 알려주세요.",
        timestamp: "2024-01-20T10:30:00Z",
      },
      {
        id: "2",
        role: "assistant",
        content:
          "두 프로젝트의 5년 예상 현금 흐름을 비교하기 위한 간단한 예시를 아래와 같이 제시합니다.\n\n프로젝트 A:\n- 초기 투자: $100,000\n- 연간 현금 흐름: $20,000\n- 5년 후 잔액: $100,000 + $100,000 = $200,000\n\n프로젝트 B:\n- 초기 투자: $150,000\n- 연간 현금 흐름: $30,000\n- 5년 후 잔액: $150,000 + $150,000 = $300,000",
        timestamp: "2024-01-20T10:30:15Z",
      },
      {
        id: "3",
        role: "user",
        content: "두 기업의 시장 리스크 보고해주세요.",
        timestamp: "2024-01-20T10:31:00Z",
      },
      {
        id: "4",
        role: "assistant",
        content:
          "시장 리스크를 비교하기 위해 두 프로젝트의 주요 요소를 정리한 간단한 표를 제시하겠습니다. 이 표는 각 프로젝트의 시장 리스크 요인을 나열합니다.",
        timestamp: "2024-01-20T10:31:20Z",
      },
    ],
    submittedAt: "2024-01-20T11:00:00Z",
  };

  // AI 피드백 대화 데이터
  const aiFeedbackConversations: Conversation[] = [
    {
      id: "feedback-1",
      role: "assistant",
      content:
        "학생님이 제출하신 프로젝트 평가 답안을 검토해보았습니다. NPV, IRR, WACC 등의 재무 지표를 적절히 활용하였고, 프로젝트의 선택에 있어서 전략적인 요소를 고려한 점이 인상적이었습니다. 🎯\n\n**첫번째로, Project B의 NPV와 IRR이 더 높긴 하지만, 프로젝트 리스크를 충분히 고려하였는지 궁금합니다.** Project B의 성장 옵션을 활용하여 경쟁사에 대응하는 것이 전략적으로 필요하다고 판단하였지만, 이러한 성장 옵션은 종종 높은 리스크를 동반하곤 합니다. 따라서, 프로젝트 B의 리스크를 어떻게 평가하였는지, 그리고 이를 어떻게 관리할 것인지에 대한 논의가 더 필요해 보입니다. 성장 옵션의 가치를 어떻게 평가하였는지, 이를 NPV 계산에 어떻게 반영하였는지도 알려주실 수 있을까요?\n\n**두번째로, 자본조달 구조에 대한 논의가 더 필요해 보입니다.** 답안에서는 Project B를 위해 50%의 부채를 활용할 계획이라고 언급하였는데, 이는 고정비용이 증가하고, 이에 따라 경영 위험이 높아질 수 있음을 의미합니다. 이러한 추가적인 리스크를 고려하였는지, 그리고 이를 관리하기 위한 계획이 있는지 알려주실 수 있을까요? 또한, 이러한 자본조달 구조가 어떻게 배당 안정성에 영향을 미치는지에 대한 논의도 필요해 보입니다.\n\n**종합적으로 봤을 때,** 답안은 NPV, IRR, WACC 등의 재무 지표를 적절히 활용하였고, 프로젝트의 선택에 있어서 전략적인 요소를 고려하였습니다. 그러나, 프로젝트 리스크와 자본조달 구조의 리스크에 대한 논의가 더 필요해 보입니다. 이러한 요소들을 고려하여 투자 결정을 다시 한번 검토해 보시는 것이 좋겠습니다.",
      timestamp: "2024-01-20T11:05:00Z",
    },
    {
      id: "feedback-2",
      role: "user",
      content:
        "**프로젝트 리스크 평가에 대해:**\nProject B의 성장 옵션은 경쟁사 대비 25%의 시장 점유율 확대 가능성을 가지고 있지만, 이에 따른 리스크도 고려하였습니다. Black-Scholes 모델을 활용하여 성장 옵션의 가치를 $45M로 산정하였으며, 이는 NPV 계산 시 옵션 가치로 반영되었습니다.\n\n**리스크 관리 방안:**\n• 단계적 투자 (Phase 1: $80M, Phase 2: $100M)\n• Pilot 프로젝트를 통한 시장 테스트\n• Exit Strategy: 2년 내 15% ROI 미달시 프로젝트 중단\n\n**자본조달 구조의 리스크 관리:**\n50% 부채 활용 시 이자비용이 증가하지만, 다음과 같은 리스크 관리 방안을 마련하였습니다:\n• Interest Rate Swap을 통한 금리 리스크 헤지\n• Debt Covenant 설정으로 재무 건전성 유지\n• 배당 안정성 확보를 위한 Retained Earnings 정책\n\n이러한 추가 분석을 통해 Project B의 타당성을 더 강화할 수 있을 것 같습니다. 어떻게 생각하시나요?",
      timestamp: "2024-01-20T11:06:00Z",
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

  useEffect(() => {
    // Simulate API call to get student submission
    const fetchSubmission = async () => {
      try {
        setLoading(true);
        // In real implementation, this would be an API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setSubmission(mockSubmission);
        setScore(mockSubmission.score || 0);
        setFeedback(mockSubmission.feedback);
      } catch (error) {
        console.error("Error fetching submission:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [resolvedParams.examId, resolvedParams.studentId]);

  const handleSaveGrade = async () => {
    try {
      setSaving(true);
      // In real implementation, this would save to database
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Grade saved:", { score, feedback });
      // Show success message
    } catch (error) {
      console.error("Error saving grade:", error);
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

  if (!submission) {
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
              {submission.studentName} 학생 채점
            </h1>
            <p className="text-muted-foreground">
              제출일: {new Date(submission.submittedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              제출 완료
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Conversations */}
        <div className="lg:col-span-2 space-y-6">
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
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {submission.aiConversations.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
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
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-900">
                  {submission.finalAnswer}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* AI Feedback Conversations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                AI 피드백 대화
              </CardTitle>
              <CardDescription>
                학생이 최종 답안 제출 후 AI와 나눈 피드백 대화입니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {aiFeedbackConversations.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
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
                            ? "bg-purple-600"
                            : "bg-indigo-600"
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
                            ? "bg-purple-600 text-white"
                            : "bg-indigo-100 text-gray-900"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                        <p className="text-xs mt-1 opacity-70">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grading Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-600" />
                채점 및 피드백
              </CardTitle>
              <CardDescription>
                학생 답안에 대한 점수와 피드백을 입력하세요
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
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
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
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="학생의 답안에 대한 상세한 피드백을 입력하세요..."
                  className="mt-1 min-h-[120px] resize-none"
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSaveGrade}
                disabled={saving}
                className="w-full"
              >
                {saving ? "저장 중..." : "채점 저장"}
              </Button>
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
