"use client";

import { useEffect, useState } from "react";
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

interface SubmitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const SUBMIT_CONFIRM_COOLDOWN_SECONDS = 3;
const SUBMIT_CONFIRM_COOLDOWN_MS = SUBMIT_CONFIRM_COOLDOWN_SECONDS * 1000;

export function SubmitConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: SubmitConfirmDialogProps) {
  const [now, setNow] = useState(() => Date.now());
  const [cooldownDeadline, setCooldownDeadline] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      const resetTimer = window.setTimeout(() => setCooldownDeadline(null), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const deadline = Date.now() + SUBMIT_CONFIRM_COOLDOWN_MS;
    const startTimer = window.setTimeout(() => setCooldownDeadline(deadline), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 250);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, [open]);

  let remainingMs = 0;
  if (open) {
    if (cooldownDeadline === null) {
      remainingMs = SUBMIT_CONFIRM_COOLDOWN_MS;
    } else {
      remainingMs = Math.max(0, cooldownDeadline - now);
    }
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isCoolingDown = remainingSeconds > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="submit-confirm-dialog" className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg sm:text-xl font-bold">
            시험 제출 확인
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm sm:text-base">
            정말로 시험을 제출하시겠습니까?
            <br />
            <span className="font-semibold text-foreground mt-2 block">
              제출 후에는 답안을 수정할 수 없습니다.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-3">
          <AlertDialogCancel className="min-h-[44px]">취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (isCoolingDown) return;
              onConfirm();
            }}
            disabled={isCoolingDown}
            className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isCoolingDown ? (
              <>
                <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-destructive-foreground border-t-transparent" aria-hidden="true" />
                제출하기 ({remainingSeconds}초)
              </>
            ) : (
              "제출하기"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
