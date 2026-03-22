"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
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
}

export function StudentListItem({
  student,
  examId,
  onLiveMonitoring,
  getStudentStatusColor,
  showFinalScore,
  analyticsData,
  examStatus,
}: StudentListItemProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-muted/50 transition-colors overflow-hidden">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <Avatar className="h-10 w-10 border flex-shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {student.name.slice(-2)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium leading-none truncate">
              {student.name}
            </h4>
            <Badge
              variant="secondary"
              className={`text-xs font-normal flex-shrink-0 ${getStudentStatusColor(
                student.status
              )}`}
            >
              {student.status === "in-progress" && (
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-600"></span>
                </span>
              )}
              {student.status === "completed"
                ? "완료"
                : student.status === "in-progress"
                ? "진행 중"
                : "시작 안함"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1 truncate">
            {student.email}
          </div>
          {(student.student_number || student.school) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {student.student_number && <span>{student.student_number}</span>}
              {student.student_number && student.school && (
                <span className="text-muted-foreground/50">&bull;</span>
              )}
              {student.school && <span>{student.school}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 self-end sm:self-auto flex-shrink-0">
        <div className="text-right min-w-[100px] sm:min-w-[120px]">
          {showFinalScore && student.finalScore !== undefined ? (
            <div className="flex flex-col items-end">
              <span className="font-semibold text-lg text-primary">
                {student.finalScore}점
              </span>
              <span className="text-xs text-muted-foreground">최종 점수</span>
            </div>
          ) : examStatus === "closed" && student.score !== undefined && student.score !== null ? (
            <div className="flex flex-col items-end">
              <span className="font-semibold text-lg">{student.score}점</span>
              <span className="text-xs text-muted-foreground">가채점</span>
              {student.status === "completed" && student.submittedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(student.submittedAt).toLocaleDateString("ko-KR")}
                </span>
              )}
            </div>
          ) : examStatus === "closed" && student.status === "completed" ? (
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">가채점 중...</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {student.status === "in-progress" && (
            <AnimateIcon animateOnHover={true} loop={true} asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50 h-8 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                onClick={() => onLiveMonitoring(student)}
              >
                <Radio size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">보기</span>
              </Button>
            </AnimateIcon>
          )}
          {student.status === "completed" && (
            <AnimateIcon
              animateOnHover={true}
              loop={true}
              loopDelay={700}
              asChild
            >
              <Button
                size="sm"
                variant="outline"
                className="text-blue-600 border-blue-600 hover:bg-blue-50 h-8 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
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
                <ClipboardCheck size={14} className="sm:mr-1" />
                <span className="hidden sm:inline">
                  {showFinalScore ? "재채점" : "채점"}
                </span>
              </Button>
            </AnimateIcon>
          )}
        </div>
      </div>
    </div>
  );
}
