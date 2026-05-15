"use client";

import { Badge } from "@/components/ui/badge";
import { RichTextViewer } from "@/components/ui/rich-text-viewer";
import type { ExamDraftPayload } from "@/lib/agent/types";

const DIFFICULTY_LABEL: Record<ExamDraftPayload["difficulty"], string> = {
  basic: "기초",
  intermediate: "중급",
  advanced: "심화",
};

/**
 * waiting_approval 상태에서 run.output(ExamDraftPayload)을
 * 강사 검토용으로 렌더한다. 읽기 전용.
 */
export function AgentDraftReview({ draft }: { draft: ExamDraftPayload }) {
  return (
    <div className="space-y-3">
      {/* 시험 메타 */}
      <div className="rounded-xl border bg-card p-3">
        <h3 className="text-sm font-semibold text-foreground">
          {draft.title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {draft.language === "ko" ? "한국어" : "English"}
          </Badge>
          <Badge variant="secondary">
            {DIFFICULTY_LABEL[draft.difficulty] ?? draft.difficulty}
          </Badge>
          <Badge variant="secondary">{draft.durationMinutes}분</Badge>
          <Badge variant="outline">문제 {draft.questions.length}개</Badge>
        </div>
      </div>

      {/* 문제 목록 */}
      <ol className="space-y-3">
        {draft.questions.map((q, idx) => (
          <li key={q.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {q.type}
              </span>
            </div>

            <div className="mt-1.5 text-sm text-foreground">
              <RichTextViewer content={q.text} />
            </div>

            {q.rubric && q.rubric.length > 0 && (
              <div className="mt-2 rounded-lg bg-muted/60 p-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  채점 루브릭
                </p>
                <ul className="space-y-1">
                  {q.rubric.map((r, rIdx) => (
                    <li key={rIdx} className="text-xs">
                      <span className="font-medium text-foreground">
                        {r.evaluationArea}
                      </span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {r.detailedCriteria}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
