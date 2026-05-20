"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { ExamStudentSummary } from "@/lib/types/student-summary";

interface UseExamStudentSummariesOptions {
  examId: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useExamStudentSummaries({
  examId,
  enabled = true,
  refetchInterval = false,
}: UseExamStudentSummariesOptions) {
  return useQuery({
    queryKey: qk.instructor.studentSummaries(examId),
    queryFn: async (): Promise<ExamStudentSummary[]> => {
      const response = await fetch(`/api/exam/${examId}/student-summaries`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (data as { message?: string }).message ||
            "학생 목록을 불러오지 못했습니다.",
        );
      }
      return (data.students ?? []) as ExamStudentSummary[];
    },
    enabled: !!examId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval,
  });
}
