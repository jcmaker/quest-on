import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Supabase 서버 전용 클라이언트
const supabase = getSupabaseServer();

export async function GET(request: NextRequest) {
  try {
    // 어드민 인증 확인
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 쿼리 파라미터 파싱 + bounds 검증
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 100 : rawLimit, 1), 500);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);
    const level = searchParams.get("level"); // 'error', 'warn', 'info' 또는 null (모두)

    // 쿼리 빌드
    let query = supabase
      .from("error_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // 레벨 필터 적용
    if (level && ["error", "warn", "info"].includes(level)) {
      query = query.eq("level", level);
    }

    const { data, error, count } = await query;

    if (error) {
      return errorJson("INTERNAL_ERROR", "Failed to fetch error logs", 500);
    }

    return successJson({
      logs: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to fetch error logs", 500);
  }
}

