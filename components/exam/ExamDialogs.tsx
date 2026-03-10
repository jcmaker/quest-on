"use client";

import { Button } from "@/components/ui/button";
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
import { AlertCircle } from "lucide-react";

interface ExamDialogsProps {
  showExitConfirm: boolean;
  setShowExitConfirm: (open: boolean) => void;
  onExitConfirm: () => void;
  unansweredDialog: { open: boolean; indices: number[] };
  setUnansweredDialog: (value: { open: boolean; indices: number[] }) => void;
  setCurrentQuestion: (idx: number) => void;
  setShowSubmitConfirm: (open: boolean) => void;
  autoSubmitFailed: boolean;
  setAutoSubmitFailed: (open: boolean) => void;
  onAutoSubmitRetry: () => void;
  onAutoSubmitExit: () => void;
  manualSubmitFailed: boolean;
  setManualSubmitFailed: (open: boolean) => void;
  onManualSubmitRetry: () => void;
  submitErrorMessage?: string | null;
}

export function ExamDialogs({
  showExitConfirm,
  setShowExitConfirm,
  onExitConfirm,
  unansweredDialog,
  setUnansweredDialog,
  setCurrentQuestion,
  setShowSubmitConfirm,
  autoSubmitFailed,
  setAutoSubmitFailed,
  onAutoSubmitRetry,
  onAutoSubmitExit,
  manualSubmitFailed,
  setManualSubmitFailed,
  onManualSubmitRetry,
  submitErrorMessage,
}: ExamDialogsProps) {
  return (
    <>
      {/* 그만두기 확인 다이얼로그 */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent data-testid="exit-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>시험을 그만두시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              진행한 내용은 저장됩니다. 시험을 종료하고 학생 대시보드로 이동합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 응시</AlertDialogCancel>
            <AlertDialogAction
              onClick={onExitConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              그만두기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 미작성 문제 안내 다이얼로그 */}
      <AlertDialog open={unansweredDialog.open} onOpenChange={(open) => setUnansweredDialog({ ...unansweredDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>미작성 문제가 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredDialog.indices.length}개의 문제에 답안이 작성되지 않았습니다. 해당 문제로 이동하거나, 현재 상태로 제출할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {unansweredDialog.indices.map((idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => {
                  setCurrentQuestion(idx);
                  setUnansweredDialog({ open: false, indices: [] });
                }}
              >
                문제 {idx + 1}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnansweredDialog({ open: false, indices: [] });
                setShowSubmitConfirm(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              미작성 상태로 제출하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 자동 제출 실패 알림 */}
      <AlertDialog open={autoSubmitFailed} onOpenChange={setAutoSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              자동 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              시간 만료로 인한 자동 제출에 실패했습니다. 아래 버튼을 눌러 수동으로 제출해주세요. 답안은 이미 저장되어 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onAutoSubmitExit}>
              저장 후 나가기
            </AlertDialogCancel>
            <AlertDialogAction onClick={onAutoSubmitRetry}>
              수동 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 수동 제출 실패 알림 */}
      <AlertDialog open={manualSubmitFailed} onOpenChange={setManualSubmitFailed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              답안 제출 실패
            </AlertDialogTitle>
            <AlertDialogDescription>
              {submitErrorMessage || "답안 제출에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={onManualSubmitRetry}>
              다시 제출
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
