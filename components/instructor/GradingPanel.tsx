import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Star, MessageSquare, FileText, CheckCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StageKey = "chat" | "answer" | "feedback";

const stageOrder: StageKey[] = ["chat", "answer", "feedback"];

const stageMeta: Record<
  StageKey,
  { label: string; description: string; icon: LucideIcon; accentClass: string }
> = {
  chat: {
    label: "채팅 단계",
    description: "학생과 AI의 상호작용을 평가하세요",
    icon: MessageSquare,
    accentClass: "text-blue-600",
  },
  answer: {
    label: "최종 답안",
    description: "학생이 제출한 답안을 평가하세요",
    icon: FileText,
    accentClass: "text-green-600",
  },
  feedback: {
    label: "피드백 대응",
    description: "AI 피드백 이후 학생의 반응을 평가하세요",
    icon: CheckCircle,
    accentClass: "text-purple-600",
  },
};

interface GradingPanelProps {
  questionNumber: number;
  stageScores: Partial<Record<StageKey, number>>;
  stageComments: Partial<Record<StageKey, string>>;
  overallScore: number;
  overallFeedback: string;
  isGraded: boolean;
  saving: boolean;
  onStageScoreChange: (stage: StageKey, value: number) => void;
  onStageCommentChange: (stage: StageKey, value: string) => void;
  onOverallScoreChange: (value: number) => void;
  onOverallFeedbackChange: (value: string) => void;
  onSave: () => void;
}

export function GradingPanel({
  questionNumber,
  stageScores,
  stageComments,
  overallScore,
  overallFeedback,
  isGraded,
  saving,
  onStageScoreChange,
  onStageCommentChange,
  onOverallScoreChange,
  onOverallFeedbackChange,
  onSave,
}: GradingPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-600" />
          문제 {questionNumber} 채점
        </CardTitle>
        <CardDescription>
          이 문제에 대한 점수와 피드백을 입력하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* <div className="space-y-4">
          {stageOrder.map((stageKey) => {
            const stage = stageMeta[stageKey];
            const stageScore = stageScores[stageKey] ?? "";
            const stageComment = stageComments[stageKey] ?? "";

            return (
              <div
                key={stageKey}
                className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-start gap-3">
                  <stage.icon className={`h-5 w-5 ${stage.accentClass}`} />
                  <div>
                    <h4 className="text-sm font-semibold">{stage.label}</h4>
                    <p className="text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label
                      htmlFor={`${stageKey}-score-${questionNumber}`}
                      className="text-xs font-medium"
                    >
                      점수 (0-100)
                    </Label>
                    <input
                      type="number"
                      id={`${stageKey}-score-${questionNumber}`}
                      min="0"
                      max="100"
                      value={stageScore}
                      onChange={(e) =>
                        onStageScoreChange(
                          stageKey,
                          Number.isNaN(Number(e.target.value))
                            ? 0
                            : Number(e.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label
                      htmlFor={`${stageKey}-comment-${questionNumber}`}
                      className="text-xs font-medium"
                    >
                      상세 피드백
                    </Label>
                    <Textarea
                      id={`${stageKey}-comment-${questionNumber}`}
                      value={stageComment}
                      onChange={(e) =>
                        onStageCommentChange(stageKey, e.target.value)
                      }
                      placeholder="이 단계에 대한 평가 의견을 입력하세요..."
                      className="mt-1 min-h-[100px] resize-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Separator /> */}

        <div className="space-y-4">
          <div>
            <Label htmlFor="score" className="text-sm font-medium">
              종합 점수 (0-100)
            </Label>
            <div className="mt-1">
              <input
                type="number"
                id="score"
                min="0"
                max="100"
                value={overallScore}
                onChange={(e) =>
                  onOverallScoreChange(
                    Number.isNaN(Number(e.target.value))
                      ? 0
                      : Number(e.target.value)
                  )
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="feedback" className="text-sm font-medium">
              종합 피드백
            </Label>
            <Textarea
              id="feedback"
              value={overallFeedback}
              onChange={(e) => onOverallFeedbackChange(e.target.value)}
              placeholder="학생의 전체 답안에 대한 종합 피드백을 입력하세요..."
              className="mt-1 min-h-[120px] resize-none"
            />
          </div>
        </div>

        <Button onClick={onSave} disabled={saving} className="w-full">
          {saving ? "저장 중..." : "문제 채점 저장"}
        </Button>

        {isGraded && (
          <div className="text-sm text-green-600 text-center">
            ✓ 채점 완료됨
          </div>
        )}
      </CardContent>
    </Card>
  );
}
