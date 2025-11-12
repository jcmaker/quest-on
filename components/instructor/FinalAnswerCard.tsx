import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { FileText } from "lucide-react";

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
}

interface FinalAnswerCardProps {
  submission: Submission | undefined;
}

export function FinalAnswerCard({ submission }: FinalAnswerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-green-600" />
          최종 답안
        </CardTitle>
        <CardDescription>학생이 제출한 최종 답안입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {submission ? (
          <div className="bg-gray-50 rounded-lg p-4">
            <RichTextViewer
              content={String(submission.answer || "답안이 없습니다.")}
              className="text-sm"
            />
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>제출된 답안이 없습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

