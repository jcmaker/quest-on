"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Send } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface AssignmentHeaderProps {
  title: string;
  deadline: string | null;
  isSubmitted: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  onDeadlineExpired?: () => void;
}

export function AssignmentHeader({
  title,
  deadline,
  isSubmitted,
  onSubmit,
  isSubmitting,
  onDeadlineExpired,
}: AssignmentHeaderProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState("");
  const [isOverdue, setIsOverdue] = useState(false);
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    if (!deadline) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setTimeLeft("마감됨");
        setIsOverdue(true);
        // Trigger auto-submit on deadline expiry (once)
        if (!expiredCalledRef.current && !isSubmitted && onDeadlineExpired) {
          expiredCalledRef.current = true;
          onDeadlineExpired();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}일 ${hours}시간 남음`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}시간 ${minutes}분 남음`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}분 ${seconds}초 남음`);
      } else {
        setTimeLeft(`${seconds}초 남음`);
      }
      setIsOverdue(false);
    };

    updateTimer();
    // Tick every second when < 5 minutes, every 60s otherwise
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - Date.now();
    const intervalMs = diff <= 5 * 60 * 1000 ? 1000 : 60000;
    const interval = setInterval(updateTimer, intervalMs);
    return () => clearInterval(interval);
  }, [deadline, isSubmitted, onDeadlineExpired]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-lg font-semibold truncate">{title}</h1>
        {isSubmitted && (
          <Badge variant="secondary" className="bg-green-100 text-green-700">
            제출 완료
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {deadline && (
          <div className={`flex items-center gap-1.5 text-sm ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
            <Clock className="w-4 h-4" />
            <span>{timeLeft}</span>
          </div>
        )}
        {!isSubmitted && (
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
            size="sm"
            className="gap-1.5"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? "제출 중..." : "제출하기"}
          </Button>
        )}
      </div>
    </div>
  );
}
