import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, RefreshCw } from "lucide-react";

interface GradeHeaderProps {
  studentName: string;
  submittedAt: string;
  overallScore: number | null;
  examId: string;
  onAutoGrade: () => void;
  autoGrading: boolean;
}

export function GradeHeader({
  studentName,
  submittedAt,
  overallScore,
  examId,
  onAutoGrade,
  autoGrading,
}: GradeHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-4 mb-4">
        <Link href={`/instructor/${examId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            시험으로 돌아가기
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={onAutoGrade}
          disabled={autoGrading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${autoGrading ? "animate-spin" : ""}`}
          />
          {autoGrading ? "자동 채점 중..." : "자동 채점 다시 실행"}
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{studentName} 학생 채점</h1>
          <p className="text-muted-foreground">
            제출일: {new Date(submittedAt).toLocaleString()}
          </p>
          {overallScore !== null && (
            <p className="text-lg font-semibold mt-2">
              전체 점수: {overallScore}점
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-600">
            <CheckCircle className="w-4 h-4 mr-1" />
            제출 완료
          </Badge>
        </div>
      </div>
    </div>
  );
}

