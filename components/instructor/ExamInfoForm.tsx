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
                    시험의 제목을 입력하세요. 예: "국제경영론 25-1 중간고사"와 같이
                    과목명과 시험 정보를 포함하면 좋습니다.
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
                className="font-mono"
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
                  학생들이 시험을 치르는 데 주어지는 시간을 설정하세요. 슬라이더를
                  조절하거나 빠른 선택 버튼을 사용할 수 있습니다. 최소 15분부터 최대
                  480분(8시간)까지 설정 가능합니다.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 min-w-[60px]">
                {duration}분
              </span>
              <input
                type="range"
                min="15"
                max="480"
                step="15"
                value={duration}
                onChange={(e) => onDurationChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[30, 60, 90, 120, 180, 240].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={duration === time ? "default" : "outline"}
                  size="sm"
                  onClick={() => onDurationChange(time)}
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

