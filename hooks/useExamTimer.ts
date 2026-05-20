"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

export interface UseExamTimerOptions {
  duration: number; // minutes; 0 = unlimited
  sessionStartTime?: string | null;
  timeRemaining?: number | null; // seconds from server
  onTimeExpired?: () => void;
}

export function formatExamTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export function isExamTimeCritical(seconds: number, durationMinutes: number): boolean {
  const threshold = Math.max(5 * 60, durationMinutes * 60 * 0.2);
  return seconds <= threshold;
}

export function isExamTimeUrgent(seconds: number): boolean {
  return seconds > 0 && seconds <= 60;
}

export function useExamTimer({
  duration,
  sessionStartTime,
  timeRemaining: initialTimeRemaining,
  onTimeExpired,
}: UseExamTimerOptions) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [hasExpired, setHasExpired] = useState(false);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const hasWarned5min = useRef(false);
  const hasWarned1min = useRef(false);
  const onTimeExpiredRef = useRef(onTimeExpired);
  onTimeExpiredRef.current = onTimeExpired;
  const expiredCalledRef = useRef(false);

  const triggerExpiry = () => {
    if (expiredCalledRef.current || !onTimeExpiredRef.current) return;
    expiredCalledRef.current = true;
    setHasExpired(true);
    setShowExpiredDialog(true);
    onTimeExpiredRef.current();
  };

  useEffect(() => {
    if (duration === 0) {
      setTimeRemaining(null);
      return;
    }

    if (sessionStartTime) {
      const startTime = new Date(sessionStartTime).getTime();
      const now = Date.now();
      const totalSeconds = duration * 60;
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setTimeRemaining(remaining);
      if (remaining <= 0) triggerExpiry();
    } else if (initialTimeRemaining !== null && initialTimeRemaining !== undefined) {
      setTimeRemaining(Math.max(0, initialTimeRemaining));
      if (initialTimeRemaining <= 0) triggerExpiry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerExpiry is stable per mount
  }, [sessionStartTime, initialTimeRemaining, duration]);

  useEffect(() => {
    if (
      duration === 0 ||
      initialTimeRemaining === null ||
      initialTimeRemaining === undefined ||
      hasExpired
    )
      return;

    setTimeRemaining((prev) => {
      if (prev === null) return Math.max(0, initialTimeRemaining);
      const drift = Math.abs(prev - initialTimeRemaining);
      return drift > 3 ? Math.max(0, initialTimeRemaining) : prev;
    });
  }, [initialTimeRemaining, duration, hasExpired]);

  useEffect(() => {
    if (duration === 0) return;
    if (timeRemaining === null || timeRemaining <= 0 || hasExpired) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          if (!hasExpired) triggerExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, hasExpired, duration]);

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

  return {
    timeRemaining,
    hasExpired,
    showExpiredDialog,
    setShowExpiredDialog,
    isUnlimited: duration === 0,
  };
}
