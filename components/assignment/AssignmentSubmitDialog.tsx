"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface AssignmentSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export function AssignmentSubmitDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: AssignmentSubmitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            과제를 제출하시겠습니까?
          </DialogTitle>
          <DialogDescription>
            제출하면 대화가 종료되고, 바로 타임어택 퀴즈가 시작됩니다. 퀴즈까지 완료해야 최종 제출됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "제출 중..." : "제출하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
