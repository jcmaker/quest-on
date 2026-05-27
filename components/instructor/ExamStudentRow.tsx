"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Radio } from "@/components/animate-ui/icons/radio";
import { ClipboardCheck } from "@/components/animate-ui/icons/clipboard-check";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import { Bot } from "lucide-react";
import {
  caseStatusLabel,
  type ExamStudentOverallStatus,
  type ExamStudentSummary,
} from "@/lib/types/student-summary";

function formatProgress(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${correct}/${total}`;
}

function CaseScoreBadge({
  overallStatus,
  caseScore,
  total,
}: {
  overallStatus: ExamStudentOverallStatus;
  caseScore?: number;
  total: number;
}) {
  if (total === 0) return <span className="text-sm tabular-nums">—</span>;
  if (overallStatus === "ai_graded" && caseScore != null) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs font-normal whitespace-nowrap gap-1">
        <Bot className="h-3 w-3" aria-hidden="true" />
        {caseScore}점
      </Badge>
    );
  }
  if (overallStatus === "manually_graded" && caseScore != null) {
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-normal whitespace-nowrap">
        {caseScore}점
      </Badge>
    );
  }
  return null;
}

function overallStatusBadge(status: ExamStudentOverallStatus) {
  switch (status) {
    case "manually_graded":
      return <Badge className="bg-blue-100 text-blue-800 text-xs">채점완료</Badge>;
    case "ai_graded":
      return <Badge className="bg-indigo-100 text-indigo-800 text-xs">AI채점</Badge>;
    case "grading":
      return <Badge className="bg-amber-100 text-amber-800 text-xs">채점중</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-800 text-xs">채점실패</Badge>;
    case "pending":
      return <Badge className="bg-orange-100 text-orange-800 text-xs">채점대기</Badge>;
    case "in-progress":
      return <Badge className="bg-yellow-100 text-yellow-800 text-xs">응시중</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-800 text-xs">미시작</Badge>;
  }
}

interface ExamStudentRowProps {
  student: ExamStudentSummary;
  examId: string;
  canOpenGrading?: boolean;
  onLiveMonitoring?: (student: ExamStudentSummary) => void;
}

export function ExamStudentRow({
  student,
  examId,
  canOpenGrading = false,
  onLiveMonitoring,
}: ExamStudentRowProps) {
  const subInfo = [student.studentNumber, student.school]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="grid grid-cols-[1fr_72px_72px_72px_140px_100px_80px] gap-3 items-center px-4 py-3 hover:bg-muted/50 transition-colors"
      data-testid={`exam-student-row-${student.sessionId}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 border shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
            {student.name.slice(-2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{student.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {subInfo || student.email || ""}
          </div>
          {student.overallScore != null &&
            (student.overallStatus === "ai_graded" ||
              student.overallStatus === "manually_graded") && (
              <div className="text-xs text-muted-foreground mt-0.5">
                최종{" "}
                <span className="font-medium text-foreground">
                  {student.overallScore}점
                </span>
              </div>
            )}
        </div>
      </div>

      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.mcq.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=multiple-choice`}
            className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {formatProgress(student.mcq.correct, student.mcq.total)}
          </Link>
        ) : (
          formatProgress(student.mcq.correct, student.mcq.total)
        )}
      </div>
      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.ox.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=true-false`}
            className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {formatProgress(student.ox.correct, student.ox.total)}
          </Link>
        ) : (
          formatProgress(student.ox.correct, student.ox.total)
        )}
      </div>
      <div className="text-sm tabular-nums text-center">
        {canOpenGrading && student.status === "submitted" && student.caseProgress.total > 0 ? (
          <Link
            href={`/instructor/${examId}/grade/${student.sessionId}?questionType=case`}
            className="flex justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {["ai_graded", "manually_graded"].includes(student.overallStatus) &&
            student.caseScore != null ? (
              <CaseScoreBadge
                overallStatus={student.overallStatus}
                caseScore={student.caseScore}
                total={student.caseProgress.total}
              />
            ) : (
              caseStatusLabel(student.status, student.caseProgress)
            )}
          </Link>
        ) : (
          caseStatusLabel(student.status, student.caseProgress)
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {student.submittedAt
          ? new Date(student.submittedAt).toLocaleString("ko-KR", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-"}
      </div>

      <div>{overallStatusBadge(student.overallStatus)}</div>

      <div className="text-center">
        {student.status === "in-progress" && onLiveMonitoring && (
          <AnimateIcon animateOnHover loop asChild>
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50 h-7 px-2 text-xs"
              onClick={() => onLiveMonitoring(student)}
            >
              <Radio size={14} className="mr-1" />
              실시간
            </Button>
          </AnimateIcon>
        )}
        {canOpenGrading && student.status === "submitted" && (
          <AnimateIcon animateOnHover loop loopDelay={700} asChild>
            <Link href={`/instructor/${examId}/grade/${student.sessionId}`}>
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 border-blue-600 hover:bg-blue-50 h-7 px-2 text-xs"
              >
                <ClipboardCheck size={14} className="mr-1" />
                {student.overallStatus === "manually_graded" ? "재채점" : "채점"}
              </Button>
            </Link>
          </AnimateIcon>
        )}
      </div>
    </div>
  );
}
