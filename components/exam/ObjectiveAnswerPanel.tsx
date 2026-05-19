"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ObjectiveAnswerPanelProps {
  /** 문제 유형: multiple-choice 또는 true-false. */
  type: string;
  /** 선택지. true-false 면 통상 ["O", "X"]. */
  options?: string[];
  /**
   * 현재 답안 — 선택한 선택지 인덱스의 문자열("2"). 미선택 시 빈 문자열.
   * 채점기(Phase 1)가 이 문자열을 파싱한다.
   */
  value: string;
  /** 선택 시 인덱스 문자열을 그대로 전달. */
  onChange: (value: string) => void;
  /**
   * 선택지 표시 순서 — 원본 인덱스의 순열. 예: [2,0,3,1].
   * 객관식(multiple-choice)을 섞어 보여줄 때 사용한다. 순수 표시용이며,
   * 저장되는 값은 항상 원본 인덱스다. 없으면 원본 순서 그대로 렌더한다.
   */
  displayOrder?: number[];
  fullHeight?: boolean;
}

/**
 * 객관식/OX 문제의 학생 응시 위젯.
 *
 * 선택지를 라디오 리스트로 렌더하고, 선택한 인덱스를 문자열로 저장한다.
 * AI 튜터 채팅 없이 구조화된 선택만 수행한다 (제품 결정 #2).
 */
export function ObjectiveAnswerPanel({
  type,
  options,
  value,
  onChange,
  displayOrder,
  fullHeight = false,
}: ObjectiveAnswerPanelProps) {
  // true-false 는 옵션이 비어 있어도 O/X 로 폴백.
  const resolvedOptions =
    options && options.length > 0
      ? options
      : type === "true-false"
        ? ["O", "X"]
        : [];

  // 표시 순서 — 유효한 순열일 때만 사용하고, 아니면 원본 순서로 폴백.
  // true-false 는 절대 섞지 않는다 (항상 항등 순서).
  const order =
    type !== "true-false" &&
    displayOrder &&
    displayOrder.length === resolvedOptions.length
      ? displayOrder
      : resolvedOptions.map((_, index) => index);

  const selectedIndex = (() => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  })();

  return (
    <div
      className={cn(
        "overflow-y-auto hide-scrollbar bg-muted/20",
        fullHeight && "h-full",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-2xl bg-background",
          fullHeight && "min-h-full",
        )}
      >
        <div className="space-y-4 p-4 sm:p-6 lg:p-8">
          <p className="text-sm font-semibold text-muted-foreground">
            {type === "true-false" ? "참 / 거짓을 선택하세요" : "정답을 선택하세요"}
          </p>

          {resolvedOptions.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              선택지가 없는 문제입니다. 시험 출제자에게 문의하세요.
            </p>
          ) : (
            <ul className="space-y-2.5" role="radiogroup" aria-label="답안 선택지">
              {order.map((originalIndex, displayIndex) => {
                const option = resolvedOptions[originalIndex];
                const isSelected = selectedIndex === originalIndex;
                return (
                  <li key={originalIndex}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => onChange(String(originalIndex))}
                      data-testid={`objective-option-${originalIndex}`}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors sm:p-4",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40 text-muted-foreground",
                        )}
                      >
                        {displayIndex + 1}
                      </span>
                      <span className="flex-1 text-sm sm:text-base">
                        {option}
                      </span>
                      {isSelected && (
                        <CheckCircle2
                          className="size-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            선택한 답안은 자동으로 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
