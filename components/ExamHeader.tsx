"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import ProgressBar from "@/components/ProgressBar";

interface ExamHeaderProps {
  examCode: string;
  duration: number; // in minutes
  currentStep: "exam" | "answer" | "feedback";
  user?: {
    imageUrl?: string;
    fullName?: string | null;
    firstName?: string | null;
    emailAddresses?: Array<{ emailAddress: string }>;
  } | null;
  onExit?: () => void;
}

export function ExamHeader({
  examCode,
  duration,
  currentStep,
  user,
  onExit,
}: ExamHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Initialize timer
  useEffect(() => {
    const timerKey = `exam_timer_${examCode}`;
    const startTimeKey = `exam_start_${examCode}`;

    // Check if there's an existing start time
    let startTime = localStorage.getItem(startTimeKey);

    if (!startTime) {
      // First time starting this exam - save start time
      startTime = Date.now().toString();
      localStorage.setItem(startTimeKey, startTime);
    }

    // Calculate time remaining
    const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000); // seconds
    const totalSeconds = duration * 60;
    const remaining = Math.max(0, totalSeconds - elapsed);

    setTimeRemaining(remaining);
  }, [examCode, duration]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

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

  // Get step-specific badge
  const getStepBadge = () => {
    switch (currentStep) {
      case "exam":
        return (
          <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            진행중
          </div>
        );
      case "answer":
        return (
          <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
            <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
            답안 작성
          </div>
        );
      case "feedback":
        return (
          <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            피드백 중
          </div>
        );
    }
  };

  return (
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
                  isTimeCritical(timeRemaining)
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
                {formatTime(timeRemaining)}
              </div>
            )}
          </div>

          {/* Center: Progress Steps */}
          <div className="flex justify-center">
            <ProgressBar currentStep={currentStep} />
          </div>

          {/* Right: Exit Button (only on exam step) + Profile */}
          <div className="flex items-center justify-end space-x-3">
            {currentStep === "exam" && onExit && (
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
  );
}
