import { NextResponse } from "next/server";

/**
 * 표준화된 API 응답 헬퍼
 *
 * 성공: { success: true, ...data }
 * 에러: { error: code, message, details? }
 *
 * 기존 응답 포맷과의 호환성:
 * - 성공 시 data 필드를 스프레드하여 기존 클라이언트 코드와 호환
 * - 에러 시 `error` 필드를 유지하여 기존 extractErrorMessage() 호환
 */

export function successJson(
  data: Record<string, unknown> = {},
  statusOrOptions?: number | { status?: number; headers?: Record<string, string> }
): NextResponse {
  const status = typeof statusOrOptions === "number" ? statusOrOptions : statusOrOptions?.status ?? 200;
  const headers = typeof statusOrOptions === "object" ? statusOrOptions?.headers : undefined;
  return NextResponse.json({ success: true, ...data }, { status, headers });
}

export function errorJson(
  code: string,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      error: code,
      message,
      ...(details !== undefined && { details }),
    },
    { status }
  );
}
