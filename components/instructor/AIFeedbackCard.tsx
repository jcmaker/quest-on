import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";
import { MessageSquare } from "lucide-react";

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
  decompressed?: {
    answerData?: Record<string, unknown>;
    feedbackData?: Record<string, unknown>;
  };
}

interface AIFeedbackCardProps {
  submission: Submission | undefined;
  submittedAt: string;
}

export function AIFeedbackCard({
  submission,
  submittedAt,
}: AIFeedbackCardProps) {
  if (!submission?.ai_feedback) {
    return null;
  }

  const getFeedbackContent = () => {
    if (typeof submission.ai_feedback === "string") {
      try {
        const parsed = JSON.parse(submission.ai_feedback);
        return parsed.feedback || submission.ai_feedback;
      } catch {
        return submission.ai_feedback;
      }
    } else if (
      typeof submission.ai_feedback === "object" &&
      submission.ai_feedback !== null
    ) {
      return (
        (submission.ai_feedback as { feedback?: string }).feedback ||
        JSON.stringify(submission.ai_feedback, null, 2)
      );
    }
    return String(submission.ai_feedback || "");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-600" />
          AI 피드백
        </CardTitle>
        <CardDescription>
          학생 답안에 대한 AI의 자동 피드백입니다
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <AIMessageRenderer
            content={getFeedbackContent()}
            timestamp={
              (submission.decompressed?.feedbackData?.timestamp as string) ||
              submittedAt
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

