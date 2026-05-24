import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface ObjectiveGradeCardProps {
  type: string;
  options?: string[];
  correctOptionIndex?: number;
  /** 학생이 제출한 답안 문자열 — 선택지 인덱스("2"). */
  studentAnswer?: string;
}

/**
 * 강사 채점 검토 화면의 객관식/OX 문제 표시 카드.
 *
 * 학생이 고른 선택지와 정답 선택지를 나란히 보여준다. 채팅 단계 UI 없음 —
 * 객관식은 결정론적으로 채점되므로 강사는 결과만 확인한다.
 */
export function ObjectiveGradeCard({
  type,
  options,
  correctOptionIndex,
  studentAnswer,
}: ObjectiveGradeCardProps) {
  const resolvedOptions =
    options && options.length > 0
      ? options
      : type === "true-false"
        ? ["O", "X"]
        : [];

  const selectedIndex = (() => {
    const parsed = Number.parseInt((studentAnswer ?? "").trim(), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  })();

  const hasCorrect =
    typeof correctOptionIndex === "number" && correctOptionIndex >= 0;
  const isCorrect =
    hasCorrect && selectedIndex !== null && selectedIndex === correctOptionIndex;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          {type === "true-false" ? "O·X 채점" : "객관식 채점"}
          {hasCorrect && selectedIndex !== null && (
            <Badge variant={isCorrect ? "default" : "destructive"}>
              {isCorrect ? "정답" : "오답"}
            </Badge>
          )}
          {selectedIndex === null && (
            <Badge variant="outline">무응답</Badge>
          )}
        </CardTitle>
        <CardDescription>
          학생이 선택한 답안과 정답을 비교합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {resolvedOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            선택지 정보가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {resolvedOptions.map((option, index) => {
              const isStudentPick = selectedIndex === index;
              const isAnswer = correctOptionIndex === index;
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3 text-sm",
                    isAnswer
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : isStudentPick
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="flex-1">{option}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isStudentPick && (
                      <Badge variant="outline" className="gap-1">
                        {isAnswer ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-destructive" />
                        )}
                        학생 선택
                      </Badge>
                    )}
                    {isAnswer && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        정답
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!hasCorrect && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            이 문제에 정답 정보가 없어 자동 채점되지 않았습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
