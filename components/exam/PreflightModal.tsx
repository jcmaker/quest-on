"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, FileText, Shield, AlertTriangle } from "lucide-react";

interface PreflightModalProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  examTitle?: string;
  examDuration?: number;
  examDescription?: string;
}

export function PreflightModal({
  open,
  onAccept,
  onCancel,
  examTitle,
  examDuration,
  examDescription,
}: PreflightModalProps) {
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [aiLogAccepted, setAiLogAccepted] = useState(false);

  const handleAccept = () => {
    if (rulesAccepted && aiLogAccepted) {
      onAccept();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-5 w-5 text-primary" />
            시험 시작 전 안내사항
          </DialogTitle>
          <DialogDescription>
            시험을 시작하기 전에 다음 사항을 확인해주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 시험 정보 */}
          {examTitle && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                시험 정보
              </h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">시험명:</span> {examTitle}
                </p>
                {examDuration && (
                  <p>
                    <span className="font-medium">시험 시간:</span> {examDuration}분
                  </p>
                )}
                {examDescription && (
                  <p>
                    <span className="font-medium">설명:</span> {examDescription}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 시간 정책 */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              시간 정책
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  시험 시간은 강사가 "시험 시작" 버튼을 클릭하는 순간부터 시작됩니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  시험 시간이 종료되면 자동으로 제출되며, 이후 답안 수정이 불가능합니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  답안은 자동으로 저장되며, 수동 저장도 가능합니다 (Ctrl+S / Cmd+S).
                </span>
              </li>
            </ul>
          </div>

          {/* 시험 규칙 */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              시험 규칙
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  시험 중 다른 브라우저 탭이나 프로그램을 사용할 수 없습니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  답안 복사/붙여넣기는 감지되며, 부정행위로 간주될 수 있습니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  AI 채팅 기능을 사용할 수 있으나, 모든 대화 내용이 기록됩니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>
                  시험 중 페이지를 닫거나 새로고침하면 세션이 비활성화될 수 있습니다.
                </span>
              </li>
            </ul>
          </div>

          {/* AI 로그 공지 */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">AI 채팅 로그 기록 안내</p>
                <p className="text-sm">
                  시험 중 AI와 나눈 모든 대화 내용은 자동으로 기록되며, 시험 평가에
                  활용될 수 있습니다. AI의 도움을 받은 내용은 정직하게 표시해주세요.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* 확인 체크박스 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="rules"
                checked={rulesAccepted}
                onCheckedChange={(checked) =>
                  setRulesAccepted(checked === true)
                }
                className="mt-1"
              />
              <label
                htmlFor="rules"
                className="text-sm leading-relaxed cursor-pointer"
              >
                위의 시간 정책 및 시험 규칙을 모두 확인하고 준수하겠습니다.
              </label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="ai-log"
                checked={aiLogAccepted}
                onCheckedChange={(checked) =>
                  setAiLogAccepted(checked === true)
                }
                className="mt-1"
              />
              <label
                htmlFor="ai-log"
                className="text-sm leading-relaxed cursor-pointer"
              >
                AI 채팅 로그가 기록됨을 확인하고, AI의 도움을 받은 내용은 정직하게
                표시하겠습니다.
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!rulesAccepted || !aiLogAccepted}
          >
            확인 및 입장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
