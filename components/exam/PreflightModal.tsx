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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Clock, FileText, Shield, AlertTriangle, ChevronDown } from "lucide-react";

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

        <div className="space-y-4 py-4">
          {/* 핵심 요약 */}
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/20">
            <ul className="space-y-2 text-sm font-medium">
              <li className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{examDuration === 0 ? "시간 제한 없음 (과제형) · 답안은 30초마다 자동 저장" : "시간 종료 시 자동 제출 · 답안은 30초마다 자동 저장"}</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>플랫폼 내 AI만 사용 가능 · 외부 도구 사용 금지</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>모든 AI 대화 및 활동이 기록되어 평가에 활용됩니다</span>
              </li>
            </ul>
          </div>

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
                {examDuration != null && examDuration > 0 && (
                  <p>
                    <span className="font-medium">시험 시간:</span> {examDuration}분
                  </p>
                )}
                {examDuration === 0 && (
                  <p>
                    <span className="font-medium">시험 시간:</span> 무제한 (과제형)
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

          {/* 세부 규칙 (접을 수 있는 아코디언) */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full border rounded-lg p-4 hover:bg-muted/50 transition-colors text-left">
              <span className="font-semibold text-sm">세부 시험 규칙 보기</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-2">
              {/* 시간 정책 */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-primary" />
                  시간 정책
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {examDuration === 0 ? (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>시간 제한이 없는 과제형 시험입니다. 자유롭게 작성하세요.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>답안은 자동으로 저장되며, 수동 저장도 가능합니다 (Ctrl+S / Cmd+S).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>작성이 완료되면 &quot;시험 제출하기&quot; 버튼을 클릭해주세요.</span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>시험 시간은 강사가 &quot;시험 시작&quot; 버튼을 클릭하는 순간부터 시작됩니다.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>시험 시간이 종료되면 자동으로 제출되며, 이후 답안 수정이 불가능합니다.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>답안은 자동으로 저장되며, 수동 저장도 가능합니다 (Ctrl+S / Cmd+S).</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* 시험 규칙 */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  시험 규칙
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>시험 중 다른 브라우저 탭이나 프로그램을 사용할 수 없습니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>답안 복사/붙여넣기는 감지되며, 부정행위로 간주될 수 있습니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>AI 채팅 기능을 사용할 수 있으나, 모든 대화 내용이 기록됩니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>시험 중 페이지를 닫아도 답안은 자동 저장됩니다. 같은 시험 코드로 다시 입장할 수 있습니다.</span>
                  </li>
                </ul>
              </div>

              {/* AI 사용 정책 */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  AI 사용 정책
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <span className="text-blue-600 font-bold mt-0.5 text-sm">1</span>
                    <div>
                      <p className="font-semibold text-sm text-blue-700 dark:text-blue-400">플랫폼 내 AI 자유 활용</p>
                      <p className="text-muted-foreground text-xs mt-0.5">Quest-ON 내 AI Assistant를 자유롭게 사용하세요.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                    <span className="text-red-600 font-bold mt-0.5 text-sm">2</span>
                    <div>
                      <p className="font-semibold text-sm text-red-700 dark:text-red-400">외부 AI/도구 사용 금지</p>
                      <p className="text-muted-foreground text-xs mt-0.5">ChatGPT, Claude 등 외부 도구 사용 시 평가가 무효 처리될 수 있습니다.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                    <span className="text-primary font-bold mt-0.5 text-sm">3</span>
                    <div>
                      <p className="font-semibold text-sm">사고 과정 중심 평가</p>
                      <p className="text-muted-foreground text-xs mt-0.5">논리적 사고력, AI 활용 능력, 비판적 분석이 핵심 평가 기준입니다.</p>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* AI 로그 공지 */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">AI 채팅 로그 기록 안내</p>
                <p className="text-sm">
                  시험 중 AI와 나눈 모든 대화 내용은 자동으로 기록되며, 시험 평가에
                  활용될 수 있습니다.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* 확인 체크박스 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="rules"
                data-testid="preflight-rules-checkbox"
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
                data-testid="preflight-ailog-checkbox"
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
            data-testid="preflight-accept-btn"
          >
            확인 및 입장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
