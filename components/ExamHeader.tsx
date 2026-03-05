"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExamHeaderProps {
  examCode: string;
  duration: number; // in minutes
  currentStep: "exam" | "answer";
  user?: {
    imageUrl?: string;
    fullName?: string | null;
    firstName?: string | null;
    emailAddresses?: Array<{ emailAddress: string }>;
  } | null;
  sessionStartTime?: string | null; // 세션 시작 시간 (ISO string)
  timeRemaining?: number | null; // 남은 시간 (초 단위, 서버에서 계산된 값)
  onTimeExpired?: () => void; // 시간 종료 시 콜백
  onExit?: () => void;
  disableLogoLink?: boolean; // 시험 중 로고 클릭 비활성화
}

export function ExamHeader({
  examCode,
  duration,
  currentStep,
  user,
  sessionStartTime,
  timeRemaining: initialTimeRemaining,
  onTimeExpired,
  onExit,
  disableLogoLink = false,
}: ExamHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const hasWarned5min = useRef(false);
  const hasWarned1min = useRef(false);

  // Initialize timer - 세션 시작 시간 기반으로 계산
  useEffect(() => {
    // duration이 0(무제한)이면 타이머를 초기화하지 않음
    if (duration === 0) {
      setTimeRemaining(null);
      return;
    }

    if (sessionStartTime) {
      // 서버에서 받은 세션 시작 시간 사용
      const startTime = new Date(sessionStartTime).getTime();
      const now = Date.now();
      const totalSeconds = duration * 60;
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);

      setTimeRemaining(remaining);

      // 이미 시간이 지났으면 즉시 처리
      if (remaining <= 0 && onTimeExpired) {
        setHasExpired(true);
        setShowExpiredDialog(true);
        onTimeExpired();
      }
    } else if (initialTimeRemaining !== null && initialTimeRemaining !== undefined) {
      // 서버에서 계산된 남은 시간 사용
      setTimeRemaining(Math.max(0, initialTimeRemaining));
      
      if (initialTimeRemaining <= 0 && onTimeExpired) {
        setHasExpired(true);
        setShowExpiredDialog(true);
        onTimeExpired();
      }
    }
  }, [sessionStartTime, initialTimeRemaining, duration, onTimeExpired]);

  // Sync timer with server on heartbeat responses
  useEffect(() => {
    if (
      duration === 0 ||
      initialTimeRemaining === null ||
      initialTimeRemaining === undefined ||
      hasExpired
    )
      return;

    // Only sync if there's a significant drift (>3 seconds) to avoid jitter
    setTimeRemaining((prev) => {
      if (prev === null) return Math.max(0, initialTimeRemaining);
      const drift = Math.abs(prev - initialTimeRemaining);
      return drift > 3 ? Math.max(0, initialTimeRemaining) : prev;
    });
  }, [initialTimeRemaining, duration, hasExpired]);

  // Timer countdown 및 시간 종료 체크
  useEffect(() => {
    // duration이 0(무제한)이면 타이머를 실행하지 않음
    if (duration === 0) {
      return;
    }

    if (timeRemaining === null || timeRemaining <= 0 || hasExpired) {
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          // ✅ 시간 종료 시 자동 제출
          if (!hasExpired && onTimeExpired) {
            setHasExpired(true);
            setShowExpiredDialog(true);
            onTimeExpired();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining, hasExpired, onTimeExpired, duration]);

  // Time warning toasts (5 min / 1 min)
  useEffect(() => {
    if (timeRemaining === null || hasExpired || duration === 0) return;

    if (timeRemaining <= 300 && timeRemaining > 60 && !hasWarned5min.current) {
      hasWarned5min.current = true;
      toast("남은 시간 5분", {
        icon: "⏰",
        style: { background: "#fef3c7", color: "#92400e", fontWeight: 600 },
        duration: 5000,
      });
    }

    if (timeRemaining <= 60 && !hasWarned1min.current) {
      hasWarned1min.current = true;
      toast("남은 시간 1분! 곧 자동 제출됩니다", {
        icon: "🚨",
        style: { background: "#fee2e2", color: "#991b1b", fontWeight: 600 },
        duration: 8000,
      });
    }
  }, [timeRemaining, hasExpired, duration]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Check if time is critical (20% of total duration or less, minimum 5 minutes)
  const isTimeCritical = (seconds: number): boolean => {
    const threshold = Math.max(5 * 60, duration * 60 * 0.2);
    return seconds <= threshold;
  };

  // Check if time is in final minute (urgent)
  const isTimeUrgent = (seconds: number): boolean => {
    return seconds > 0 && seconds <= 60;
  };

  return (
    <>
      <div className="bg-background/95 backdrop-blur-sm border-b flex-shrink-0">
        <div className="container mx-auto px-6 py-2">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Step Badge + Timer */}
            <div className="flex items-center space-x-3 justify-start">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On"
                width={120}
                height={32}
                className={`h-8 w-auto ${disableLogoLink ? "pointer-events-none opacity-70" : ""}`}
              />
              {duration === 0 ? (
                <div className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="whitespace-nowrap">
                    시간 무제한 (과제형)
                  </span>
                  <span className="ml-2 text-xs opacity-75">
                    제한 시간 없음
                  </span>
                </div>
              ) : (
                timeRemaining !== null && (
                  <div
                    className={`inline-flex items-center rounded-lg font-semibold transition-all ${
                      hasExpired || timeRemaining <= 0
                        ? "px-3 py-1.5 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        : isTimeUrgent(timeRemaining)
                        ? "px-4 py-2 text-base bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200 animate-pulse ring-2 ring-red-400"
                        : isTimeCritical(timeRemaining)
                        ? "px-3 py-1.5 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 ring-1 ring-red-300"
                        : "px-3 py-1.5 text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    }`}
                  >
                    <svg
                      className={`mr-2 ${isTimeUrgent(timeRemaining) ? "w-5 h-5" : "w-4 h-4"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {hasExpired || timeRemaining <= 0
                      ? "00:00"
                      : formatTime(timeRemaining)}
                  </div>
                )
              )}
            </div>

            {/* Right: Exit Button (only on exam step) + Profile */}
            <div className="flex items-center justify-end space-x-3">
              {currentStep === "exam" && onExit && !hasExpired && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExit}
                  className="text-sm border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                >
                  그만두기
                </Button>
              )}
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={user?.imageUrl}
                  alt={user?.fullName || "User"}
                />
                <AvatarFallback>
                  {user?.firstName?.charAt(0) ||
                    user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ||
                    "U"}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 시간 종료 알림 다이얼로그 */}
      <AlertDialog open={showExpiredDialog} onOpenChange={setShowExpiredDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              시험 시간이 종료되었습니다
            </AlertDialogTitle>
            <AlertDialogDescription>
              시험 시간이 종료되어 답안이 자동으로 제출되었습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="min-h-[44px]">
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
