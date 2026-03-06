"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState } from "react";
// import { logError } from "@/lib/logger"; // 에러 로그 수집 중단 (성능 최적화)

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({}),
        mutationCache: new MutationCache({}),
        defaultOptions: {
          queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
            // 전역 재시도 전략
            retry: (failureCount, error) => {
              // 4xx 에러 및 네트워크 에러는 재시도하지 않음
              if (error instanceof Error) {
                // HTTP status code 기반 판별
                const statusMatch = error.message.match(/\b([4]\d{2})\b/);
                if (statusMatch) return false;
                // "status" 프로퍼티가 있는 경우 (fetch wrapper에서 설정)
                const statusCode = (error as Error & { status?: number }).status;
                if (statusCode && statusCode >= 400 && statusCode < 500) return false;
                if (error.message.includes("Failed to fetch")) return false;
              }
              // 최대 2회 재시도
              return failureCount < 2;
            },
          },
          mutations: {
            // Mutation은 기본적으로 재시도하지 않음
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
