"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Users, Loader2 } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase-client";

interface WaitingRoomProps {
  examTitle?: string;
  examCode?: string;
  allowDraftInWaiting?: boolean;
  allowChatInWaiting?: boolean;
  onGateStart?: () => void;
  sessionId?: string;
  examId?: string;
  studentId?: string;
}

export function WaitingRoom({
  examTitle,
  examCode,
  allowDraftInWaiting = false,
  allowChatInWaiting = false,
  onGateStart,
  sessionId,
  examId,
  studentId,
}: WaitingRoomProps) {
  const [isWaiting, setIsWaiting] = useState(true);
  const onGateStartRef = useRef(onGateStart);
  onGateStartRef.current = onGateStart;

  // Lightweight status check (used for fallback polling only)
  const checkExamStatus = useCallback(async () => {
    if (!examCode || !studentId) return;
    try {
      const response = await fetch("/api/supa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_exam_session",
          data: { examCode, studentId },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.gateStarted && result.sessionStatus === "in_progress") {
          setIsWaiting(false);
          onGateStartRef.current?.();
        }
      }
    } catch {
      // Non-critical polling error
    }
  }, [examCode, studentId]);

  // Supabase Realtime subscription for exam status changes
  useEffect(() => {
    if (!examId || !isWaiting) return;

    const supabase = createSupabaseClient();

    const channel = supabase
      .channel(`exam_gate_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exams",
          filter: `id=eq.${examId}`,
        },
        (payload) => {
          // When exam status changes to "running", trigger gate start check
          const newStatus = payload.new?.status;
          if (newStatus === "running") {
            checkExamStatus();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, isWaiting, checkExamStatus]);

  // Fallback polling: 30-second interval (instead of 3-second)
  useEffect(() => {
    if (!sessionId || !examCode || !studentId || !isWaiting) return;

    // Initial check
    checkExamStatus();

    // 30-second fallback polling
    const interval = setInterval(checkExamStatus, 30000);

    return () => clearInterval(interval);
  }, [sessionId, examCode, studentId, isWaiting, checkExamStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl" data-testid="waiting-room">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <Clock className="h-6 w-6 text-primary absolute top-3 left-3" />
            </div>
          </div>
          <CardTitle className="text-2xl">대기실</CardTitle>
          <CardDescription className="text-base mt-2">
            강사가 시험을 시작하기를 기다리고 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 시험 정보 */}
          {examTitle && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  시험 정보
                </h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="font-medium">시험명:</span> {examTitle}
                  </p>
                  {examCode && (
                    <p>
                      <span className="font-medium">시험 코드:</span> {examCode}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 안내 메시지 */}
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">시험 시작 대기 중</p>
                <p className="text-sm">
                  강사가 &quot;시험 시작&quot; 버튼을 클릭하면 시험이 시작됩니다. 이 페이지를
                  닫지 마세요.
                </p>
                {!allowDraftInWaiting && !allowChatInWaiting && (
                  <p className="text-sm text-muted-foreground mt-2">
                    시험이 시작되기 전까지 답안 작성이나 AI 채팅이 불가능합니다.
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* Drafting 허용 안내 */}
          {allowDraftInWaiting && (
            <Alert variant="default">
              <AlertDescription>
                <p className="text-sm">
                  <span className="font-semibold">참고:</span> 대기 중에도 답안 초안을
                  작성할 수 있습니다. 시험이 시작되면 자동으로 저장됩니다.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* 상태 표시 */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>시험 시작 신호 대기 중...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
