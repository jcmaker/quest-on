import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { User } from "lucide-react";

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
}

interface StudentReplyCardProps {
  submission: Submission | undefined;
}

export function StudentReplyCard({ submission }: StudentReplyCardProps) {
  if (!submission?.student_reply) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5 text-green-600" />
          학생의 반박 답변
        </CardTitle>
        <CardDescription>AI 피드백에 대한 학생의 응답입니다</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-green-50 rounded-lg p-4">
          <RichTextViewer
            content={submission.student_reply}
            className="text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}

