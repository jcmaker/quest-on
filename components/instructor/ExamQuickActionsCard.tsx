import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ExamQuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>빠른 작업</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button className="w-full" variant="outline">
          시험 코드 공유
        </Button>
        <Button className="w-full" variant="outline">
          결과 다운로드
        </Button>
        <Button className="w-full" variant="outline">
          분석 보기
        </Button>
      </CardContent>
    </Card>
  );
}

