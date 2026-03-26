"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Radio } from "@/components/animate-ui/icons/radio";
import { ClipboardCheck } from "@/components/animate-ui/icons/clipboard-check";
import { AnimateIcon } from "@/components/animate-ui/icons/icon";
import type { InstructorStudent } from "@/lib/types/exam";

interface AnalyticsData {
  averageScore?: number;
  averageQuestions?: number;
  averageAnswerLength?: number;
  averageExamDuration?: number;
  standardDeviationScore?: number;
  standardDeviationQuestions?: number;
  standardDeviationAnswerLength?: number;
  standardDeviationExamDuration?: number;
}

interface StudentListItemProps {
  student: InstructorStudent;
  examId: string;
  onLiveMonitoring: (student: InstructorStudent) => void;
  getStudentStatusColor: (status: string) => string;
  showFinalScore: boolean;
  analyticsData?: AnalyticsData | null;
  examStatus?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (sessionId: string, checked: boolean) => void;
}

export function StudentListItem({
  student,
  examId,
  onLiveMonitoring,
  getStudentStatusColor,
  showFinalScore,
  analyticsData,
  examStatus,
  selectable,
  selected,
  onSelect,
}: StudentListItemProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const subInfo = [student.student_number, student.school].filter(Boolean).join(" · ");

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Checkbox */}
          {selectable && (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect?.(student.id, !!checked)}
              className="flex-shrink-0"
            />
          )}

          {/* Avatar */}
          <Avatar className="h-9 w-9 border flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
              {student.name.slice(-2)}
            </AvatarFallback>
          </Avatar>

          {/* Name + Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{student.name}</span>
              <Badge
                variant="secondary"
                className={`text-[11px] font-normal flex-shrink-0 px-1.5 py-0 ${getStudentStatusColor(student.status)}`}
              >
                {student.status === "in-progress" && (
                  <span className="relative flex h-1.5 w-1.5 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-600" />
                  </span>
                )}
                {student.status === "completed"
                  ? "완료"
                  : student.status === "in-progress"
                  ? "진행 중"
                  : "시작 안함"}
              </Badge>
            </div>
            {subInfo && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subInfo}</p>
            )}
          </div>

          {/* Score */}
          <div className="text-right flex-shrink-0 min-w-[80px]">
            {showFinalScore && student.finalScore !== undefined ? (
              <>
                <div className="font-semibold text-base text-foreground">{student.finalScore}점</div>
                <div className="text-[11px] text-muted-foreground">최종 점수</div>
              </>
            ) : student.score !== undefined && student.score !== null ? (
              <>
                <div className="font-semibold text-base text-muted-foreground/60">{student.score}점</div>
                <div className="text-[11px] text-muted-foreground">가채점</div>
              </>
            ) : student.status === "completed" ? (
              <div className="flex items-center gap-1.5 justify-end">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">채점 중</span>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {student.aiComment && (
              <CollapsibleTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
              </CollapsibleTrigger>
            )}
            {student.status === "in-progress" && (
              <AnimateIcon animateOnHover={true} loop={true} asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-600 hover:bg-green-50 h-8 px-2.5 text-xs whitespace-nowrap"
                  onClick={() => onLiveMonitoring(student)}
                >
                  <Radio size={14} className="mr-1" />
                  보기
                </Button>
              </AnimateIcon>
            )}
            {student.status === "completed" && (
              <AnimateIcon animateOnHover={true} loop={true} loopDelay={700} asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 h-8 px-2.5 text-xs whitespace-nowrap"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (analyticsData) {
                      params.set("avgScore", String(analyticsData.averageScore || 0));
                      params.set("avgQuestions", String(analyticsData.averageQuestions || 0));
                      params.set("avgAnswerLength", String(analyticsData.averageAnswerLength || 0));
                      params.set("avgExamDuration", String(analyticsData.averageExamDuration || 0));
                      params.set("stdDevScore", String(analyticsData.standardDeviationScore || 0));
                      params.set("stdDevQuestions", String(analyticsData.standardDeviationQuestions || 0));
                      params.set("stdDevAnswerLength", String(analyticsData.standardDeviationAnswerLength || 0));
                      params.set("stdDevExamDuration", String(analyticsData.standardDeviationExamDuration || 0));
                    }
                    const queryString = params.toString();
                    router.push(`/instructor/${examId}/grade/${student.id}${queryString ? `?${queryString}` : ""}`);
                  }}
                >
                  <ClipboardCheck size={14} className="mr-1" />
                  {showFinalScore ? "재채점" : "채점"}
                </Button>
              </AnimateIcon>
            )}
          </div>
        </div>

        {/* AI Reasoning expandable section */}
        <CollapsibleContent>
          {student.aiComment && (
            <div className="px-4 pb-3">
              <div className="ml-12 p-3 bg-muted/30 rounded-lg border text-sm">
                <p className="text-xs font-medium text-muted-foreground mb-1">AI 채점 피드백</p>
                <p className="text-muted-foreground text-xs whitespace-pre-wrap leading-relaxed">
                  {student.aiComment}
                </p>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
