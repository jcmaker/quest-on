import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
}

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface FinalAnswerCardProps {
  submission: Submission | undefined;
  pasteLogs?: PasteLog[];
  questionId?: string;
}

export function FinalAnswerCard({
  submission,
  pasteLogs,
  questionId,
}: FinalAnswerCardProps) {
  // 현재 문제에 해당하는 로그만 필터링
  const relevantLogs =
    pasteLogs?.filter((log) => !questionId || log.question_id === questionId) ||
    [];
  const suspiciousLogs = relevantLogs.filter((log) => log.suspicious);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>최종 답안</CardTitle>
          </div>
          {suspiciousLogs.length > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              외부 붙여넣기 {suspiciousLogs.length}건
            </Badge>
          )}
        </div>
        <CardDescription>학생이 제출한 최종 답안입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {submission ? (
          <div className="space-y-3">
            {suspiciousLogs.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      부정행위 의심 활동 감지
                    </p>
                    <div className="text-xs text-red-700 space-y-1">
                      {suspiciousLogs.map((log) => (
                        <p key={log.id}>
                          • {log.length.toLocaleString()}자 붙여넣기 (
                          {new Date(log.timestamp).toLocaleString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                          )
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4">
              <RichTextViewer
                content={submission.answer || "답안이 없습니다."}
                className="text-sm"
              />
            </div>
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
