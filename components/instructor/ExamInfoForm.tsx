import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface ExamInfoFormProps {
  title: string;
  code: string;
  duration: number;
  onTitleChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onGenerateCode: () => void;
}

export function ExamInfoForm({
  title,
  code,
  duration,
  onTitleChange,
  onCodeChange,
  onDurationChange,
  onGenerateCode,
}: ExamInfoFormProps) {
  const [durationInput, setDurationInput] = useState<string>(
    duration === 0 ? "" : duration.toString()
  );
  const isUnlimited = duration === 0;

  const handleUnlimitedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onDurationChange(0); // 무제한 설정
      setDurationInput("");
    } else {
      onDurationChange(60); // 기본값 복구
      setDurationInput("60");
    }
  };

  const handleDurationInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setDurationInput(value);

    // 빈 값이면 아무것도 하지 않음
    if (value === "") {
      return;
    }

    // 소수점이나 비정상적인 문자 제거 후 정수로 변환
    // parseInt는 자동으로 소수점 이하를 버리고, 숫자가 아닌 문자는 무시함
    const numValue = parseInt(value.replace(/[^0-9]/g, ""), 10);

    // 숫자가 아니거나 NaN이면 무시
    if (isNaN(numValue) || numValue < 0) {
      return;
    }

    // 1분 ~ 1440분(24시간) 사이의 값만 허용
    if (numValue >= 1 && numValue <= 1440) {
      onDurationChange(numValue);
    } else if (numValue > 1440) {
      // 최대값 초과 시 최대값으로 제한
      setDurationInput("1440");
      onDurationChange(1440);
    }
  };

  const handleDurationInputBlur = () => {
    // 포커스가 벗어날 때 유효성 검사
    if (durationInput === "") {
      return;
    }

    // 소수점이나 비정상적인 문자 제거 후 정수로 변환
    const cleanedValue = durationInput.replace(/[^0-9]/g, "");
    const numValue = parseInt(cleanedValue, 10);

    if (isNaN(numValue) || numValue < 1) {
      // 유효하지 않은 값이면 최소값으로 설정
      setDurationInput("1");
      onDurationChange(1);
    } else if (numValue > 1440) {
      // 최대값 초과 시 최대값으로 설정
      setDurationInput("1440");
      onDurationChange(1440);
    } else {
      // 정상적인 값이면 정수로 정규화하여 표시
      setDurationInput(numValue.toString());
    }
  };

  // duration이 외부에서 변경되었을 때 (예: 빠른 선택 버튼 클릭) 동기화
  useEffect(() => {
    if (duration === 0) {
      setDurationInput("");
    } else if (durationInput !== duration.toString()) {
      setDurationInput(duration.toString());
    }
  }, [duration]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>시험 정보</CardTitle>
        <CardDescription>시험의 기본 세부사항</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="title">시험 제목</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    시험의 제목을 입력하세요. 예: &quot;국제경영론 25-1
                    중간고사&quot;와 같이 과목명과 시험 정보를 포함하면
                    좋습니다.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="예) 국제경영론 25-1 중간고사"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="code">시험 코드</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    학생들이 시험에 접속할 때 사용하는 고유 코드입니다. 자동으로
                    생성되며, 재생성 버튼을 눌러 변경할 수 있습니다.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex gap-2">
              <Input
                id="code"
                value={code}
                onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
                placeholder={code}
                className="exam-code"
                required
                disabled
              />
              <Button type="button" variant="outline" onClick={onGenerateCode}>
                재생성
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="duration">시험 시간</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  학생들이 시험을 치르는 데 주어지는 시간을 설정하세요.
                  슬라이더를 조절하거나 직접 입력할 수 있습니다. 무제한으로
                  설정하면 시간 제한 없이 제출할 때까지 풀 수 있습니다.
                  최소 1분부터 최대 1440분(24시간)까지 설정 가능합니다.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-3">
            {/* 무제한 체크박스 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="unlimited"
                checked={isUnlimited}
                onChange={handleUnlimitedChange}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label
                htmlFor="unlimited"
                className="text-sm font-medium cursor-pointer"
              >
                시간 무제한 (과제형)
              </Label>
            </div>

            {/* 시간 입력 영역 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <Input
                  type="number"
                  id="duration"
                  min="1"
                  max="1440"
                  value={durationInput}
                  onChange={handleDurationInputChange}
                  onBlur={handleDurationInputBlur}
                  disabled={isUnlimited}
                  placeholder={isUnlimited ? "무제한" : "분"}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">분</span>
              </div>
              <input
                type="range"
                min="1"
                max="1440"
                step="1"
                value={isUnlimited ? 60 : duration}
                onChange={(e) => {
                  if (!isUnlimited) {
                    const value = parseInt(e.target.value);
                    onDurationChange(value);
                    setDurationInput(value.toString());
                  }
                }}
                disabled={isUnlimited}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {/* 빠른 선택 버튼 */}
            <div className="flex gap-2 flex-wrap">
              {[30, 60, 90, 120, 180, 240].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={
                    !isUnlimited && duration === time ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    if (!isUnlimited) {
                      onDurationChange(time);
                      setDurationInput(time.toString());
                    }
                  }}
                  disabled={isUnlimited}
                  className="text-xs"
                >
                  {time}분
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
