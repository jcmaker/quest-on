"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState } from "react";
// import { logError } from "@/lib/logger"; // 에러 로그 수집 중단 (성능 최적화)

// 안정적 데이터에 대한 staleTime 설정 (query key prefix 기반)
const STALE_TIME_MAP: Record<string, number> = {
  "student-report": 5 * 60 * 1000, // 리포트: 5분 (읽기 전용)
  "instructor-exam-detail": 5 * 60 * 1000, // 시험 상세: 5분
  "session-grade": 2 * 60 * 1000, // 채점 데이터: 2분
  "exam-analytics": 5 * 60 * 1000, // 분석 데이터: 5분
  "student-sessions": 30 * 1000, // 세션 목록: 30초
  "instructor-exams": 2 * 60 * 1000, // 시험 목록: 2분
};

function createQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({}),
    mutationCache: new MutationCache({}),
    defaultOptions: {
      queries: {
        // 기본 staleTime (query별 override는 아래 setQueryDefaults로)
        staleTime: 60 * 1000,
        // 전역 재시도 전략
        retry: (failureCount, error) => {
          // 4xx 에러 및 네트워크 에러는 재시도하지 않음
          if (error instanceof Error) {
            const statusMatch = error.message.match(/\b([4]\d{2})\b/);
            if (statusMatch) return false;
            const statusCode = (error as Error & { status?: number }).status;
            if (statusCode && statusCode >= 400 && statusCode < 500) return false;
            if (error.message.includes("Failed to fetch")) return false;
          }
          // 최대 2회 재시도
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });

  // Query별 staleTime 자동 적용
  for (const [prefix, staleTime] of Object.entries(STALE_TIME_MAP)) {
    client.setQueryDefaults([prefix], { staleTime });
  }

  return client;
}

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
