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
  hasCanvasContent: boolean;
}

export function AssignmentSubmitDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  hasCanvasContent,
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
            제출 후에는 수정할 수 없습니다. 제출 전에 내용을 다시 확인해주세요.
          </DialogDescription>
        </DialogHeader>
        {!hasCanvasContent && (
          <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
            캔버스에 작성된 내용이 없습니다. 내용을 작성한 후 제출하시는 것을 권장합니다.
          </div>
        )}
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
