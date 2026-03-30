import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Clerk 클라이언트 직접 초기화
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function GET(request: NextRequest) {
  try {
    // 어드민 인증 확인
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // 페이지네이션 파라미터 파싱
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 100 : rawLimit, 1), 500);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // 사용자 정보 가져오기 (페이지네이션 적용)
    const users = await clerk.users.getUserList({
      limit,
      offset,
    });

    const usersWithRoles = users.data.map((user) => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      role: (user.unsafeMetadata?.role as string) || "student",
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      imageUrl: user.imageUrl,
    }));

    // Role별 통계 계산
    const stats = {
      total: users.totalCount,
      instructors: usersWithRoles.filter((u) => u.role === "instructor").length,
      students: usersWithRoles.filter((u) => u.role === "student").length,
      noRole: usersWithRoles.filter((u) => !u.role || u.role === "").length,
    };

    return successJson({
      users: usersWithRoles,
      stats,
      pagination: {
        limit,
        offset,
        total: users.totalCount,
        hasMore: offset + limit < users.totalCount,
      },
    });
  } catch (error) {
    logError("Failed to fetch users", error, { path: "/api/admin/users" });
    return errorJson("INTERNAL_ERROR", "Failed to fetch users", 500);
  }
}
