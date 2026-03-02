"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import { CopyProtector } from "@/components/exam/CopyProtector";
import { ChevronsDown } from "lucide-react";

interface Question {
  id: string;
  text: string;
  type: string;
  points: number;
  title?: string;
  ai_context?: string;
}

interface RubricItem {
  id?: string;
  evaluationArea: string;
  detailedCriteria: string;
}

interface QuestionPanelProps {
  question: Question;
  questionNumber: number;
  rubric?: RubricItem[];
  rubricPublic?: boolean;
}

export function QuestionPanel({
  question,
  questionNumber,
  rubric,
  rubricPublic,
}: QuestionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  return (
    <div className="relative h-full flex flex-col border-b border-border bg-muted/20">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto hide-scrollbar animate-in slide-in-from-top-2 duration-300"
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
        }}
      >
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
              문제 {questionNumber}
            </span>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              {question.type === "essay" ? "서술형 문제" : "문제"}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              배점: {question.points}점
            </span>
          </div>

          {question.title && (
            <div className="bg-muted/40 p-3 sm:p-4 rounded-lg border border-border">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">
                {question.title}
              </h3>
            </div>
          )}

          <div className="bg-card p-4 sm:p-5 rounded-lg border border-border shadow-sm">
            <CopyProtector>
              <RichTextViewer
                content={question.text || ""}
                className="text-sm sm:text-base leading-relaxed"
              />
            </CopyProtector>
          </div>

          <div className="bg-muted/40 p-3 sm:p-4 rounded-lg border border-border">
            <h4 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base text-foreground">
              요구사항
            </h4>
            <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>문제를 정확히 이해하고 답변하세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>풀이 과정을 단계별로 명확히 작성하세요</span>
              </li>
            </ul>
          </div>

          {rubricPublic && rubric && rubric.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-200 dark:border-blue-800 p-4 sm:p-5 rounded-lg mt-4 shadow-sm">
              <h4 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <span className="text-lg">📋</span>
                <span>평가 기준 (루브릭)</span>
              </h4>
              <div className="space-y-2.5 sm:space-y-3">
                {rubric.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="bg-white dark:bg-blue-900/20 p-3 sm:p-4 rounded-md border border-blue-100 dark:border-blue-800/50 shadow-sm"
                  >
                    <div className="font-semibold text-sm sm:text-base text-blue-800 dark:text-blue-200 mb-1.5 sm:mb-2">
                      {item.evaluationArea || `평가 영역 ${index + 1}`}
                    </div>
                    <div className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                      {item.detailedCriteria || "세부 기준 미설정"}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-3 sm:mt-4 italic">
                이 평가 기준에 따라 답안이 평가됩니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {scrollTop === 0 && (
        <div className="sticky bottom-0 left-0 right-0 z-20 flex justify-center pb-2 pt-2 bg-gradient-to-t from-muted/20 via-muted/20 to-transparent pointer-events-none">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              scrollRef.current?.scrollTo({
                top: 100,
                behavior: "smooth",
              });
            }}
            className="rounded-full bg-transparent hover:bg-transparent border-transparent hover:border-transparent min-h-[44px] px-4 gap-2 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
            aria-label="더 읽기"
          >
            <ChevronsDown
              className="w-4 h-4 animate-bounce"
              aria-hidden="true"
            />
          </Button>
        </div>
      )}
    </div>
  );
}
