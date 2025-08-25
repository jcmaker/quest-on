"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
}

interface Exam {
  id: string;
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: Question[];
}

interface Answer {
  questionId: string;
  text: string;
}

export default function AnswerSubmission() {
  const params = useParams();
  const { signOut } = useClerk();
  const examCode = params.code as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [showFeedback, setShowFeedback] = useState(false);

  // Mock exam data - replace with actual data from Supabase
  useEffect(() => {
    const mockExam: Exam = {
      id: "1",
      title: "수학 101 중간고사",
      code: examCode,
      description: "대수학과 미적분학을 다루는 종합적인 중간고사",
      duration: 90,
      questions: [
        {
          id: "1",
          text: "이차방정식을 풀어라: x² + 5x + 6 = 0",
          type: "essay",
          points: 25,
        },
        {
          id: "2",
          text: "f(x) = x³ + 2x² - 5x + 1의 도함수를 구하라",
          type: "essay",
          points: 30,
        },
        {
          id: "3",
          text: "적분을 계산하라: ∫(2x + 3)dx",
          type: "essay",
          points: 25,
        },
        {
          id: "4",
          text: "미적분학에서 극한의 개념을 설명하라",
          type: "essay",
          points: 20,
        },
      ],
    };
    setExam(mockExam);

    // Initialize answers array
    const initialAnswers = mockExam.questions.map((q) => ({
      questionId: q.id,
      text: "",
    }));
    setAnswers(initialAnswers);
  }, [examCode]);

  const updateAnswer = (questionId: string, text: string) => {
    setAnswers((prev) =>
      prev.map((answer) =>
        answer.questionId === questionId ? { ...answer, text } : answer
      )
    );
  };

  const handleSubmit = async () => {
    if (!exam) return;

    // Check if all questions have answers
    const unansweredQuestions = answers.filter((answer) => !answer.text.trim());
    if (unansweredQuestions.length > 0) {
      alert("모든 문제에 답안을 작성해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit answers to API
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examCode,
          answers,
          examId: exam.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setFeedback(data.feedback);
        setIsSubmitted(true);
        setShowFeedback(true);
      }
    } catch (error) {
      console.error("Error submitting answers:", error);
      alert("답안 제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!exam) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">시험 로딩 중...</div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-green-600">
                시험이 성공적으로 제출되었습니다!
              </CardTitle>
              <CardDescription>
                답안이 제출되었으며 검토 중입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  이제 AI 피드백을 확인하고 답안을 검토할 수 있습니다.
                </p>
                <Button onClick={() => setShowFeedback(true)}>
                  AI 피드백 보기
                </Button>
              </div>

              <div className="text-center">
                <Link href="/student">
                  <Button variant="outline">대시보드로 돌아가기</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback Dialog */}
        <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>AI 피드백 & 분석</DialogTitle>
              <DialogDescription>
                시험 성과에 대한 상세한 피드백
              </DialogDescription>
            </DialogHeader>
            <div className="prose max-w-none">
              <div dangerouslySetInnerHTML={{ __html: feedback }} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{exam.title}</h1>
              <p className="text-muted-foreground">코드: {exam.code}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">최종 답안 제출</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-red-600 hover:text-red-700 mt-2"
              >
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Answer Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    문제 {currentQuestion + 1} / {exam.questions.length}
                  </CardTitle>
                  <Badge variant="outline">
                    {exam.questions[currentQuestion]?.points}점
                  </Badge>
                </div>
                <CardDescription>
                  {exam.questions[currentQuestion]?.type === "essay"
                    ? "서술형"
                    : exam.questions[currentQuestion]?.type === "short-answer"
                    ? "단답형"
                    : exam.questions[currentQuestion]?.type ===
                      "multiple-choice"
                    ? "객관식"
                    : exam.questions[currentQuestion]?.type}{" "}
                  문제
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none mb-6">
                  <p className="text-lg leading-relaxed">
                    {exam.questions[currentQuestion]?.text}
                  </p>
                </div>

                <div className="space-y-4">
                  <Label className="text-sm font-medium">답안</Label>
                  <Textarea
                    placeholder="여기에 상세한 답안을 작성하세요..."
                    value={answers[currentQuestion]?.text || ""}
                    onChange={(e) =>
                      updateAnswer(
                        exam.questions[currentQuestion].id,
                        e.target.value
                      )
                    }
                    className="min-h-[300px]"
                  />
                  <p className="text-sm text-muted-foreground">
                    이해도를 보여주는 포괄적인 답안을 작성하세요.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentQuestion((prev) => Math.max(0, prev - 1))
                }
                disabled={currentQuestion === 0}
              >
                이전 문제
              </Button>
              <Button
                onClick={() =>
                  setCurrentQuestion((prev) =>
                    Math.min(exam.questions.length - 1, prev + 1)
                  )
                }
                disabled={currentQuestion === exam.questions.length - 1}
              >
                다음 문제
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress */}
            <Card>
              <CardHeader>
                <CardTitle>진행 상황</CardTitle>
                <CardDescription>답안 작성 완료 상태</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {exam.questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full ${
                            answers[index]?.text.trim()
                              ? "bg-green-500"
                              : "bg-gray-300"
                          }`}
                        />
                        <span className="text-sm">Q{index + 1}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {question.points}점
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span>완료:</span>
                    <span className="font-medium">
                      {answers.filter((a) => a.text.trim()).length} /{" "}
                      {exam.questions.length}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          (answers.filter((a) => a.text.trim()).length /
                            exam.questions.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Question Navigation */}
            <Card>
              <CardHeader>
                <CardTitle>문제 탐색</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {exam.questions.map((_, index) => (
                    <Button
                      key={index}
                      variant={
                        currentQuestion === index ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setCurrentQuestion(index)}
                      className="h-10 w-10 p-0"
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <Card>
              <CardHeader>
                <CardTitle>시험 제출</CardTitle>
                <CardDescription>
                  제출하기 전에 답안을 검토하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || answers.some((a) => !a.text.trim())}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? "제출 중..." : "시험 제출"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  이 작업은 되돌릴 수 없습니다
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
