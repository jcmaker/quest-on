import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ExamDetailHeaderProps {
  title: string;
  code: string;
  examId: string;
}

export function ExamDetailHeader({
  title,
  code,
  examId,
}: ExamDetailHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">
            시험 코드: <span className="exam-code">{code}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/instructor">
            <Button variant="outline">대시보드로 돌아가기</Button>
          </Link>
          <Link href={`/instructor/${examId}/edit`}>
            <Button>시험 편집</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
