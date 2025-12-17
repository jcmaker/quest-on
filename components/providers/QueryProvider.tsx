"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
