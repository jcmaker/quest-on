"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Play, Square, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseClient } from "@/lib/supabase-client";
import { qk } from "@/lib/query-keys";

interface ExamControlButtonsProps {
  examId: string;
  examStatus: string;
  hasGateFields?: boolean; // Gate 필드(open_at, close_at)가 있는지 여부
  onStatusChange?: (newStatus: string, startedAt?: string | null) => void;
}

export function ExamControlButtons({
  examId,
  examStatus,
  hasGateFields = false,
  onStatusChange,
}: ExamControlButtonsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [closeAt, setCloseAt] = useState<string>("");
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = qk.instructor.waitingStudents(examId);

  // 대기 중인 학생 목록을 가져오는 함수
  const fetchWaitingStudents = async () => {
    const response = await fetch(`/api/exam/${examId}/sessions`);
    if (!response.ok) {
      throw new Error("Failed to fetch waiting students");
    }
    const data = await response.json();
    
    // Show ALL students with waiting status — dead sessions get cleaned up on exam start
    // (they transition to in_progress and time out if the student is gone)
    interface SessionRecord {
      student_id: string;
      status?: string;
      submitted_at?: string | null;
      student_name?: string;
      student_email?: string;
      student_number?: string;
      student_school?: string;
    }

    const waiting = (data.sessions || []).filter((session: SessionRecord) => {
      return session.status === "waiting" || (!session.status && !session.submitted_at);
    });

    // 학생 정보 추출 (중복 제거)
    const studentMap = new Map<string, {
      student_id: string;
      name: string;
      student_number?: string;
      school?: string;
    }>();

    waiting.forEach((session: SessionRecord) => {
      if (!studentMap.has(session.student_id)) {
        studentMap.set(session.student_id, {
          student_id: session.student_id,
          name: session.student_name || session.student_email || "이름 없음",
          student_number: session.student_number,
          school: session.student_school,
        });
      }
    });
    
    return Array.from(studentMap.values());
  };

  // TanStack Query로 대기 중인 학생 목록 가져오기
  const { data: waitingStudents = [], isLoading: loadingWaitingStudents } = useQuery({
    queryKey,
    queryFn: fetchWaitingStudents,
    enabled: showStartDialog, // 모달이 열렸을 때만 쿼리 활성화
    refetchInterval: 30000, // 30초마다 한 번씩 강제 동기화 (하트비트 만료 체크용)
    staleTime: 10000, // 10초간 fresh 상태 유지
  });

  // Supabase Realtime 구독 설정
  useEffect(() => {
    if (!showStartDialog) return; // 모달이 닫혀있으면 구독하지 않음

    const supabase = createSupabaseClient();
    
    // sessions 테이블의 변경사항을 실시간으로 구독
    const channel = supabase
      .channel(`waiting_room_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE 모두 감지
          schema: "public",
          table: "sessions",
          filter: `exam_id=eq.${examId}`, // 해당 시험의 세션만 필터링
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    // cleanup: 컴포넌트 언마운트 또는 모달이 닫힐 때 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, [showStartDialog, examId, queryClient, queryKey]);

  const handleStartExam = async () => {
    setIsStarting(true);
    try {
      const response = await fetch(`/api/exam/${examId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          close_at: closeAt || null,
        }),
      });

      if (response.ok) {
        toast.success("시험이 시작되었습니다.");
        setShowStartDialog(false);
        const now = new Date().toISOString();
        if (onStatusChange) {
          onStatusChange("running", now);
        } else {
          router.refresh();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(
          errorData.message || "시험 시작에 실패했습니다. 다시 시도해주세요."
        );
      }
    } catch (error) {
      toast.error("시험 시작 중 오류가 발생했습니다.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndExam = async () => {
    setIsEnding(true);
    try {
      const response = await fetch(`/api/exam/${examId}/end`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("시험이 종료되었습니다.");
        setShowEndDialog(false);
        if (onStatusChange) {
          onStatusChange("closed");
        } else {
          router.refresh();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(
          errorData.message || "시험 종료에 실패했습니다. 다시 시도해주세요."
        );
      }
    } catch (error) {
      toast.error("시험 종료 중 오류가 발생했습니다.");
    } finally {
      setIsEnding(false);
    }
  };

  // 상태별 배너 및 버튼 표시
  const getStatusDisplay = () => {
    switch (examStatus) {
      case "scheduled":
        return {
          badge: (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              예약됨
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              시험 시작
            </Button>
          ),
        };
      case "draft":
        // 기본적으로 항상 "시험 시작" 버튼 표시
        return {
          badge: (
            <Badge variant="secondary" className="bg-gray-100 text-gray-800">
              초안
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              시험 시작
            </Button>
          ),
        };
      case "joinable":
        return {
          badge: (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              입장 가능
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowStartDialog(true)}
              disabled={isStarting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="h-4 w-4 mr-2" />
              시험 시작
            </Button>
          ),
        };
      case "running":
        return {
          badge: (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              진행 중
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowEndDialog(true)}
              disabled={isEnding}
              variant="destructive"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  종료 중...
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  시험 종료
                </>
              )}
            </Button>
          ),
        };
      case "entry_closed":
        return {
          badge: (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
              입장 마감
            </Badge>
          ),
          button: (
            <Button
              onClick={() => setShowEndDialog(true)}
              disabled={isEnding}
              variant="destructive"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  종료 중...
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  시험 종료
                </>
              )}
            </Button>
          ),
        };
      case "closed":
        return {
          badge: (
            <Badge variant="secondary" className="bg-gray-100 text-gray-800">
              종료됨
            </Badge>
          ),
          button: null,
        };
      default:
        return {
          badge: (
            <Badge variant="secondary" className="bg-gray-100 text-gray-800">
              {examStatus || "알 수 없음"}
            </Badge>
          ),
          button: null,
        };
    }
  };

  const { badge, button } = getStatusDisplay();

  return (
    <>
      <div className="flex items-center gap-3">
        {badge}
        {button}
      </div>

      {/* 시험 시작 확인 모달 */}
      <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험 시작 확인</AlertDialogTitle>
            <AlertDialogDescription>
              시험을 시작하시겠습니까? 시작하면 대기 중인 모든 학생의 시험이 동시에 시작됩니다.
            </AlertDialogDescription>
            <div className="mt-4 space-y-4">
              {/* 대기 중인 학생 목록 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <strong className="text-sm font-medium">
                    대기 중인 학생 ({(waitingStudents?.length ?? 0)}명)
                  </strong>
                </div>
                {loadingWaitingStudents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      학생 목록 불러오는 중...
                    </span>
                  </div>
                ) : (waitingStudents?.length ?? 0) > 0 ? (
                  <div className="max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/30">
                    <ul className="space-y-1.5">
                      {waitingStudents.map((student) => (
                        <li
                          key={student.student_id}
                          className="text-sm flex items-center justify-between py-1"
                        >
                          <span className="font-medium">
                            {student.name}
                            {student.student_number && (
                              <span className="text-muted-foreground ml-2">
                                ({student.student_number})
                              </span>
                            )}
                          </span>
                          {student.school && (
                            <span className="text-xs text-muted-foreground">
                              {student.school}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-2 px-3 border rounded-md bg-muted/30">
                    대기 중인 학생이 없습니다.
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="close_at" className="text-sm font-medium">
                  입장 마감 시간 (선택사항)
                </Label>
                <Input
                  id="close_at"
                  type="datetime-local"
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
                  className="mt-1"
                  placeholder="입장 마감 시간을 설정하세요"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  설정하지 않으면 입장 마감 시간이 없습니다. 이 시간 이후에는 새로운 학생이 입장할 수 없습니다.
                </p>
              </div>
              <div>
                <strong className="text-sm">주의사항:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>시험 시작 후에는 되돌릴 수 없습니다.</li>
                  <li>대기 중인 모든 학생의 타이머가 동시에 시작됩니다.</li>
                  <li>시험 시간은 각 학생의 개별 타이머로 관리됩니다.</li>
                </ul>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStarting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartExam}
              disabled={isStarting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  시작 중...
                </>
              ) : (
                "시험 시작"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 시험 종료 확인 모달 */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>시험 종료 확인</AlertDialogTitle>
            <AlertDialogDescription>
              시험을 종료하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
            <div className="mt-4">
              <strong className="text-sm text-destructive">⚠️ 주의사항:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
                <li>진행 중인 모든 학생의 시험이 <strong className="text-destructive">강제로 제출</strong>됩니다.</li>
                <li>시험 종료 후에는 다시 시작할 수 없습니다.</li>
                <li>학생들이 작성 중인 답안도 마지막 저장 상태로 제출됩니다.</li>
                <li>이 작업은 <strong className="text-destructive">되돌릴 수 없습니다</strong>.</li>
              </ul>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEnding}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndExam}
              disabled={isEnding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isEnding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  종료 중...
                </>
              ) : (
                "시험 종료"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
