"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Copy, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface PasteLogsCardProps {
  pasteLogs?: PasteLog[];
  questionId?: string;
}

export function PasteLogsCard({ pasteLogs, questionId }: PasteLogsCardProps) {
  if (!pasteLogs || pasteLogs.length === 0) {
    return null;
  }

  // 현재 문제에 해당하는 로그만 필터링
  const relevantLogs = pasteLogs.filter(
    (log) => !questionId || log.question_id === questionId
  );

  if (relevantLogs.length === 0) {
    return null;
  }

  // 의심스러운 로그만 필터링
  const suspiciousLogs = relevantLogs.filter((log) => log.suspicious);

  // 전체 로그 개수
  const totalLogs = relevantLogs.length;
  const suspiciousCount = suspiciousLogs.length;

  return (
    <Card className={suspiciousCount > 0 ? "border-red-200 bg-red-50/50" : "border-orange-200 bg-orange-50/50"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {suspiciousCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : (
            <Copy className="h-4 w-4 text-orange-600" />
          )}
          <span className={suspiciousCount > 0 ? "text-red-800" : ""}>
            {suspiciousCount > 0 ? "부정행위 의심" : "붙여넣기 활동"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suspiciousCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-red-100 border border-red-300 rounded-md">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                외부 복사-붙여넣기 {suspiciousCount}건 감지
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">전체:</span>
          <Badge variant="outline" className="text-xs">{totalLogs}회</Badge>
        </div>
        {suspiciousCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">의심:</span>
            <Badge variant="destructive" className="text-xs">{suspiciousCount}회</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

