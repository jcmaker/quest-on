import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface ExamDetailsCardProps {
  description: string;
  duration: number;
  createdAt: string;
}

export function ExamDetailsCard({
  description,
  duration,
  createdAt,
}: ExamDetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>시험 정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="font-medium">설명</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="font-medium">시간</Label>
            <p className="text-sm text-muted-foreground">{duration}분</p>
          </div>
        </div>
        <div>
          <Label className="font-medium">생성일</Label>
          <p className="text-sm text-muted-foreground">
            {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

