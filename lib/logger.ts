import { createClient } from "@supabase/supabase-js";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  payload?: unknown;
  path?: string;
  user_id?: string;
}

/**
 * 서버 사이드에서 사용할 Supabase 클라이언트 생성
 * Service Role Key를 사용하여 RLS를 우회합니다.
 */
function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables for server-side logging");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

/**
 * 클라이언트 사이드에서 사용할 Supabase 클라이언트 생성
 * Anon Key를 사용합니다 (RLS 정책에 따라 insert 가능).
 */
function createClientSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables for client-side logging");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * 에러 로그를 Supabase에 저장하는 공통 함수
 * 서버 사이드와 클라이언트 사이드 모두에서 호출 가능합니다.
 * 
 * @param entry - 로그 엔트리 정보
 * @returns 성공 여부
 */
export async function insertLog(entry: LogEntry): Promise<boolean> {
  try {
    // 서버 사이드인지 클라이언트 사이드인지 확인
    const isServer = typeof window === "undefined";

    const supabase = isServer
      ? createServerSupabaseClient()
      : createClientSupabaseClient();

    // payload를 JSONB로 변환 (이미 객체인 경우 그대로, 아니면 JSON.stringify)
    let payloadJson: Record<string, unknown> = {};
    if (entry.payload !== undefined) {
      if (typeof entry.payload === "object" && entry.payload !== null) {
        payloadJson = entry.payload as Record<string, unknown>;
      } else {
        payloadJson = { value: entry.payload };
      }
    }

    const { error } = await supabase.from("error_logs").insert({
      level: entry.level,
      message: entry.message,
      payload: payloadJson,
      path: entry.path,
      user_id: entry.user_id || null,
    });

    if (error) {
      // 로깅 실패는 콘솔에만 출력 (무한 루프 방지)
      console.error("Failed to insert error log:", error);
      return false;
    }

    return true;
  } catch (error) {
    // 예외 발생 시 콘솔에만 출력
    console.error("Error in insertLog:", error);
    return false;
  }
}

/**
 * 에러 레벨 로그만 저장하는 헬퍼 함수
 * (요구사항: 오직 error와 관련된 로그만 저장)
 */
export async function logError(
  message: string,
  error?: unknown,
  options?: {
    path?: string;
    user_id?: string;
    additionalData?: Record<string, unknown>;
  }
): Promise<boolean> {
  let payload: Record<string, unknown> = {};

  if (error) {
    if (error instanceof Error) {
      payload = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...options?.additionalData,
      };
    } else if (typeof error === "object" && error !== null) {
      payload = {
        ...(error as Record<string, unknown>),
        ...options?.additionalData,
      };
    } else {
      payload = {
        error: String(error),
        ...options?.additionalData,
      };
    }
  } else if (options?.additionalData) {
    payload = options.additionalData;
  }

  return insertLog({
    level: "error",
    message,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
    path: options?.path,
    user_id: options?.user_id,
  });
}

/**
 * 경고 레벨 로그 저장 헬퍼 함수
 */
export async function logWarn(
  message: string,
  options?: {
    path?: string;
    user_id?: string;
    payload?: unknown;
  }
): Promise<boolean> {
  return insertLog({
    level: "warn",
    message,
    payload: options?.payload,
    path: options?.path,
    user_id: options?.user_id,
  });
}

/**
 * 정보 레벨 로그 저장 헬퍼 함수
 * (참고: 요구사항에 따라 error만 저장하지만, 필요시 사용 가능)
 */
export async function logInfo(
  message: string,
  options?: {
    path?: string;
    user_id?: string;
    payload?: unknown;
  }
): Promise<boolean> {
  return insertLog({
    level: "info",
    message,
    payload: options?.payload,
    path: options?.path,
    user_id: options?.user_id,
  });
}

