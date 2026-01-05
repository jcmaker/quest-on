"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState } from "react";
import { logError } from "@/lib/logger";

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            // 전역 에러 핸들러: 쿼리 에러 발생 시 자동으로 로그 저장
            // 에러 로그 저장 (비동기로 실행, 실패해도 쿼리 동작에 영향 없음)
            const path =
              typeof window !== "undefined"
                ? window.location.pathname
                : undefined;

            // 쿼리 키에서 정보 추출
            const queryKey = query?.queryKey || [];
            const queryKeyString = JSON.stringify(queryKey);

            logError(
              `Query error: ${error instanceof Error ? error.message : String(error)}`,
              error,
              {
                path,
                additionalData: {
                  queryKey: queryKeyString,
                  queryHash: query?.queryHash,
                  queryType: "query",
                },
              }
            ).catch((logError) => {
              // 로그 저장 실패는 무시 (무한 루프 방지)
              console.error("Failed to log query error:", logError);
            });
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, variables, context, mutation) => {
            // 전역 에러 핸들러: 뮤테이션 에러 발생 시 자동으로 로그 저장
            // 에러 로그 저장 (비동기로 실행, 실패해도 뮤테이션 동작에 영향 없음)
            const path =
              typeof window !== "undefined"
                ? window.location.pathname
                : undefined;

            // 뮤테이션 키에서 정보 추출
            const mutationKey = mutation?.mutationKey || [];
            const mutationKeyString = JSON.stringify(mutationKey);

            logError(
              `Mutation error: ${error instanceof Error ? error.message : String(error)}`,
              error,
              {
                path,
                additionalData: {
                  mutationKey: mutationKeyString,
                  mutationType: "mutation",
                  // variables는 민감한 정보가 포함될 수 있으므로 선택적으로만 포함
                  // variables: variables ? JSON.stringify(variables).substring(0, 500) : undefined,
                },
              }
            ).catch((logError) => {
              // 로그 저장 실패는 무시 (무한 루프 방지)
              console.error("Failed to log mutation error:", logError);
            });
          },
        }),
        defaultOptions: {
          queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
            // 전역 재시도 전략
            retry: (failureCount, error) => {
              // 4xx 에러는 재시도하지 않음
              if (
                error instanceof Error &&
                (error.message.includes("4") ||
                  error.message.includes("Failed to fetch"))
              ) {
                return false;
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
