"use client";

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

export function SubmitConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: SubmitConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
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
            onClick={onConfirm}
            className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            제출하기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
