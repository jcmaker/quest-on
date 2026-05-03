"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Clock, Loader2, ShieldQuestion } from "lucide-react";
import { useAppUser } from "@/components/providers/AppAuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { qk } from "@/lib/query-keys";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

interface QuizData {
  quiz: {
    id: string;
    sessionId: string;
    examId: string;
    status: string;
    questions: QuizQuestion[];
    answers: Record<string, number>;
    score: number | null;
    totalQuestions: number;
    timeLimitSeconds: number;
    startedAt: string | null;
    submittedAt: string | null;
    remainingSeconds: number;
  };
  exam: {
    id: string;
    title: string;
    code: string;
  };
}

export default function AssignmentQuizPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionId = params.sessionId as string;
  const { user, profile, isLoaded, isSignedIn } = useAppUser();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const autoSubmittedRef = useRef(false);
  const userRole = (profile?.role as string) || "student";

  const quizQuery = useQuery({
    queryKey: qk.student.assignmentQuiz(sessionId, user?.id),
    enabled: isLoaded && isSignedIn && userRole === "student" && !!sessionId,
    queryFn: async () => {
      const response = await fetch(`/api/student/session/${sessionId}/quiz`);
      if (!response.ok) {
        throw new Error("퀴즈를 불러오지 못했습니다.");
      }
      return response.json() as Promise<QuizData>;
    },
    retry: false,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || userRole !== "student") {
      router.replace("/student");
    }
  }, [isLoaded, isSignedIn, userRole, router]);

  useEffect(() => {
    const quiz = quizQuery.data?.quiz;
    if (!quiz) return;
    setAnswers(quiz.answers || {});
    setRemainingSeconds(quiz.remainingSeconds);
  }, [quizQuery.data?.quiz]);

  const submitMutation = useMutation({
    mutationFn: async (payload: { answers: Record<string, number> }) => {
      const response = await fetch(`/api/student/session/${sessionId}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "퀴즈 제출에 실패했습니다.");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.student.sessions(user?.id) });
      queryClient.invalidateQueries({ queryKey: qk.student.stats(user?.id) });
      toast.success("퀴즈가 제출되었습니다.");
      router.replace(`/student/report/${sessionId}`);
    },
    onError: (error) => {
      autoSubmittedRef.current = false;
      toast.error(error instanceof Error ? error.message : "퀴즈 제출에 실패했습니다.");
    },
  });

  const submitQuiz = (nextAnswers = answers) => {
    if (submitMutation.isPending || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitMutation.mutate({ answers: nextAnswers });
  };

  useEffect(() => {
    if (remainingSeconds === null || submitMutation.isPending) return;
    if (remainingSeconds <= 0) {
      submitQuiz(answers);
      return;
    }

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => (current === null ? current : Math.max(0, current - 1)));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds, submitMutation.isPending, answers]);

  const quiz = quizQuery.data?.quiz;
  const answeredCount = useMemo(() => {
    if (!quiz) return 0;
    return quiz.questions.filter((question) => typeof answers[question.id] === "number").length;
  }, [answers, quiz]);

  if (!isLoaded || quizQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">타임어택 퀴즈를 준비하는 중...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn || userRole !== "student") {
    return null;
  }

  if (quizQuery.error || !quizQuery.data || !quiz) {
    return (
      <div className="container mx-auto max-w-2xl p-6">
        <Button variant="outline" onClick={() => router.push("/student")} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          대시보드로 돌아가기
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>퀴즈를 불러올 수 없습니다</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              잠시 후 다시 시도하거나 과제 목록에서 이어서 진행해주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (quiz.submittedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle>이미 완료된 퀴즈입니다</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.replace(`/student/report/${sessionId}`)}>
              리포트로 이동
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pct = quiz.timeLimitSeconds
    ? Math.max(0, Math.min(100, Math.round(((remainingSeconds ?? 0) / quiz.timeLimitSeconds) * 100)))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-4xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldQuestion className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-semibold">타임어택 이해도 퀴즈</h1>
              </div>
              <p className="text-sm text-muted-foreground truncate">{quizQuery.data.exam.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={remainingSeconds !== null && remainingSeconds <= 5 ? "border-red-500 text-red-600" : ""}
              >
                <Clock className="w-4 h-4 mr-1" />
                {remainingSeconds ?? 0}초
              </Badge>
              <Badge variant="secondary">
                {answeredCount}/{quiz.totalQuestions} 응답
              </Badge>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <main className="container mx-auto max-w-4xl px-4 py-6">
        <Card className="mb-6 border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            제출 전 AI와 나눈 대화와 리서치 내용을 실제로 이해했는지 확인합니다. 시간이 끝나면 현재 선택한 답으로 자동 제출됩니다.
          </CardContent>
        </Card>

        <div className="space-y-4">
          {quiz.questions.map((question, questionIndex) => (
            <Card key={question.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {questionIndex + 1}. {question.question}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {question.options.map((option, optionIndex) => {
                  const selected = answers[question.id] === optionIndex;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                      disabled={submitMutation.isPending}
                    >
                      <span className="font-medium mr-2">
                        {String.fromCharCode(65 + optionIndex)}.
                      </span>
                      {option}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-0 mt-6 border-t bg-background/95 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              미응답 문항은 오답 처리됩니다.
            </p>
            <Button
              size="lg"
              onClick={() => submitQuiz()}
              disabled={submitMutation.isPending}
              className="min-h-[44px]"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  최종 제출 중...
                </>
              ) : (
                "퀴즈 제출하고 최종 제출"
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
