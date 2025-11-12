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
            <Label htmlFor="title">시험 제목</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="예) 국제경영론 25-1 중간고사"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">시험 코드</Label>
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
          <Label htmlFor="duration">시험 시간</Label>
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

