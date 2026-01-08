"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
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
}: ExamHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);

  // Initialize timer - 세션 시작 시간 기반으로 계산
  useEffect(() => {
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

  // Timer countdown 및 시간 종료 체크
  useEffect(() => {
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
  }, [timeRemaining, hasExpired, onTimeExpired]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Check if time is critical (15 minutes or less)
  const isTimeCritical = (seconds: number): boolean => {
    return seconds <= 15 * 60;
  };

  return (
    <>
      <div className="bg-background/95 backdrop-blur-sm border-b flex-shrink-0">
        <div className="container mx-auto px-6 py-2">
          <div className="grid grid-cols-3 items-center">
            {/* Left: Logo + Step Badge + Timer */}
            <div className="flex items-center space-x-3 justify-start">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
              {timeRemaining !== null && (
                <div
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    hasExpired || timeRemaining <= 0
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : isTimeCritical(timeRemaining)
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}
                >
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
                  {hasExpired || timeRemaining <= 0 ? "00:00" : formatTime(timeRemaining)}
                </div>
              )}
            </div>

            {/* Center: Progress Steps */}
            <div className="flex justify-center">
              {/* <ProgressBar currentStep={currentStep} /> */}
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
      {showExpiredDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-lg shadow-xl border p-6 max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4 text-destructive">
              시험 시간이 종료되었습니다
            </h2>
            <p className="text-muted-foreground mb-6">
              시험 시간이 종료되어 답안이 자동으로 제출되었습니다.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => setShowExpiredDialog(false)}
                className="min-h-[44px]"
              >
                확인
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
