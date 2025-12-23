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
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Copy className="h-5 w-5 text-orange-600" />
          붙여넣기 활동 로그
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suspiciousCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">
                부정행위 의심 활동 감지
              </p>
              <p className="text-sm text-red-700">
                {suspiciousCount}건의 외부 복사-붙여넣기 활동이 감지되었습니다.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">전체 붙여넣기 횟수:</span>
            <Badge variant="outline">{totalLogs}회</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">의심 활동:</span>
            <Badge variant={suspiciousCount > 0 ? "destructive" : "default"}>
              {suspiciousCount}회
            </Badge>
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {relevantLogs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-md border ${
                log.suspicious
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  {log.suspicious ? (
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        log.suspicious ? "text-red-800" : "text-green-800"
                      }`}
                    >
                      {log.suspicious
                        ? "외부 복사-붙여넣기 감지"
                        : "내부 복사-붙여넣기"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      길이: {log.length.toLocaleString()}자
                    </p>
                    <p className="text-xs text-muted-foreground">
                      시간:{" "}
                      {new Date(log.timestamp).toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

