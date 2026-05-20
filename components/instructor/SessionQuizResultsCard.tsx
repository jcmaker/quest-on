"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldQuestion } from "lucide-react";

export interface SessionQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
  rationale?: string;
}

export interface SessionQuizAttempt {
  id: string;
  questions: SessionQuizQuestion[];
  answers: Record<string, number>;
  score: number | null;
  total_questions: number;
  time_limit_seconds: number;
  submitted_at?: string | null;
}

interface SessionQuizResultsCardProps {
  quiz: SessionQuizAttempt;
  /** Omit rationale in compact sidebar mode */
  compact?: boolean;
}

export function SessionQuizResultsCard({
  quiz,
  compact = false,
}: SessionQuizResultsCardProps) {
  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldQuestion className="w-5 h-5 text-amber-600" />
          타임어택 퀴즈 결과
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            점수 {quiz.score ?? 0}/100
          </Badge>
          <Badge variant="secondary">
            {quiz.total_questions}문항 · {quiz.time_limit_seconds}초
          </Badge>
          {quiz.submitted_at && (
            <span className="text-xs text-muted-foreground">
              완료:{" "}
              {new Date(quiz.submitted_at).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {quiz.questions.map((question, index) => {
            const selectedIndex = quiz.answers?.[question.id];
            const correctIndex = question.correctOptionIndex;
            const isCorrect =
              typeof correctIndex === "number" && selectedIndex === correctIndex;

            return (
              <div key={question.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-snug">
                    {index + 1}. {question.question}
                  </p>
                  {typeof correctIndex === "number" && (
                    <Badge
                      variant="outline"
                      className={
                        isCorrect
                          ? "bg-green-500/10 text-green-700 dark:text-green-400 shrink-0"
                          : "bg-red-500/10 text-red-700 dark:text-red-400 shrink-0"
                      }
                    >
                      {isCorrect ? "정답" : "오답"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  선택:{" "}
                  {typeof selectedIndex === "number"
                    ? question.options[selectedIndex] || "무응답"
                    : "무응답"}
                </p>
                {typeof correctIndex === "number" && (
                  <p className="text-xs text-muted-foreground">
                    정답: {question.options[correctIndex]}
                  </p>
                )}
                {!compact && question.rationale && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    근거: {question.rationale}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
