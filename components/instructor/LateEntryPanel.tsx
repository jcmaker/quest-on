"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, UserCheck, UserX, Loader2 } from "lucide-react";
import { createSupabaseClient } from "@/lib/supabase-client";
import { qk } from "@/lib/query-keys";
import toast from "react-hot-toast";

interface LateStudent {
  id: string;
  student_id: string;
  student_name: string;
  student_number?: string;
  created_at: string;
  status: string;
}

interface LateEntryPanelProps {
  examId: string;
  examStatus: string;
}

export function LateEntryPanel({ examId, examStatus }: LateEntryPanelProps) {
  const queryClient = useQueryClient();
  const queryKey = qk.instructor.lateStudents(examId);
  const isRunning = examStatus === "running";

  const { data: lateStudents = [], isLoading } = useQuery<LateStudent[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/exam/${examId}/sessions?status=late_pending`);
      if (!response.ok) throw new Error("Failed to fetch late students");
      const data = await response.json();
      return (data.sessions || []) as LateStudent[];
    },
    enabled: isRunning,
    refetchInterval: 10000,
    staleTime: 0,
  });

  // Realtime subscription for late_pending sessions
  useEffect(() => {
    if (!isRunning) return;

    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`late_entry_panel_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
          queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(examId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isRunning, examId, queryClient, queryKey]);

  const lateEntryMutation = useMutation({
    mutationFn: async ({ sessionId, action }: { sessionId: string; action: "approve" | "deny" }) => {
      const response = await fetch(`/api/exam/${examId}/late-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "요청 실패");
      }
      return response.json();
    },
    onSuccess: (_, { action }) => {
      toast.success(action === "approve" ? "학생 입장을 승인했습니다." : "학생 입장을 거부했습니다.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: qk.instructor.examDetail(examId) });
    },
    onError: (error: Error) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  if (!isRunning) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Clock className="h-4 w-4" />
          지각 학생 대기
          {lateStudents.length > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {lateStudents.length}명
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>불러오는 중...</span>
          </div>
        ) : lateStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            지각 대기 중인 학생이 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {lateStudents.map((student) => {
              const waitingSince = new Date(student.created_at);
              const waitingMs = Date.now() - waitingSince.getTime();
              const waitingMin = Math.floor(waitingMs / 60000);
              const waitingSec = Math.floor((waitingMs % 60000) / 1000);
              const isPending = lateEntryMutation.isPending;

              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{student.student_name}</p>
                    {student.student_number && (
                      <p className="text-xs text-muted-foreground">{student.student_number}</p>
                    )}
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      {waitingMin}분 {waitingSec}초 대기 중
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                      disabled={isPending}
                      onClick={() =>
                        lateEntryMutation.mutate({ sessionId: student.id, action: "approve" })
                      }
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400"
                      disabled={isPending}
                      onClick={() =>
                        lateEntryMutation.mutate({ sessionId: student.id, action: "deny" })
                      }
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      거부
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
