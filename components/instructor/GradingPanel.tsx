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
import { Star } from "lucide-react";
import { useState, useEffect } from "react";

type StageKey = "chat" | "answer" | "feedback";

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
  // stageScores,
  // stageComments,
  overallScore,
  overallFeedback,
  isGraded,
  saving,
  // onStageScoreChange,
  // onStageCommentChange,
  onOverallScoreChange,
  onOverallFeedbackChange,
  onSave,
}: GradingPanelProps) {
  // 입력 중에는 문자열로 관리하여 "020" 같은 문제 방지
  const [scoreInput, setScoreInput] = useState<string>(overallScore.toString());

  // overallScore가 외부에서 변경되면 (예: 다른 문제로 이동) input 값 업데이트
  useEffect(() => {
    setScoreInput(overallScore.toString());
  }, [overallScore]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-600" />
          문제 {questionNumber} 채점
        </CardTitle>
        <CardDescription>
          {isGraded && overallScore > 0
            ? "AI 가채점 완료. 점수와 피드백을 수정할 수 있습니다."
            : "이 문제에 대한 점수와 피드백을 입력하세요"}
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
                value={scoreInput}
                onFocus={(e) => {
                  // 값이 0일 때만 전체 선택하여 쉽게 삭제되도록 함
                  if (scoreInput === "0") {
                    e.target.select();
                  }
                }}
                onChange={(e) => {
                  let value = e.target.value;

                  // 빈 문자열 허용 (입력 중)
                  if (value === "") {
                    setScoreInput("");
                    return;
                  }

                  // 숫자가 아닌 문자는 무시
                  if (!/^\d*$/.test(value)) {
                    return;
                  }

                  // "020", "002" 같은 경우를 방지: 0으로 시작하는 여러 자리 숫자는 첫 번째 0 제거
                  // 단, "0" 자체는 허용
                  if (value.length > 1 && value.startsWith("0")) {
                    value = value.replace(/^0+/, "") || "0";
                  }

                  // 입력 중에는 문자열로 유지
                  setScoreInput(value);

                  // 숫자로 변환하여 범위 체크 및 부모 컴포넌트에 전달
                  const numValue = Number(value);
                  if (!Number.isNaN(numValue)) {
                    // 0-100 범위로 제한
                    const clampedValue = Math.max(0, Math.min(100, numValue));
                    onOverallScoreChange(clampedValue);

                    // 클램핑된 값이 원래 값과 다르면 input 업데이트
                    if (clampedValue !== numValue) {
                      setScoreInput(clampedValue.toString());
                    }
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value;

                  // blur 시 빈 값이거나 유효하지 않은 값이면 0으로 설정
                  if (value === "" || Number.isNaN(Number(value))) {
                    setScoreInput("0");
                    onOverallScoreChange(0);
                    return;
                  }

                  const numValue = Number(value);
                  // 0-100 범위로 제한하고 정규화
                  const clampedValue = Math.max(0, Math.min(100, numValue));
                  setScoreInput(clampedValue.toString());
                  onOverallScoreChange(clampedValue);
                }}
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
            ✓ {overallScore > 0 ? "AI 가채점 완료" : "채점 완료됨"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
