import { NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";

// Clerk 클라이언트 직접 초기화
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function GET() {
  try {
    // 어드민 인증 확인
    const denied = await requireAdmin();
    if (denied) return denied;

    // 모든 사용자 정보 가져오기
    const users = await clerk.users.getUserList({
      limit: 100, // 최대 100명까지
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
      total: usersWithRoles.length,
      instructors: usersWithRoles.filter((u) => u.role === "instructor").length,
      students: usersWithRoles.filter((u) => u.role === "student").length,
      noRole: usersWithRoles.filter((u) => !u.role || u.role === "").length,
    };

    return successJson({
      users: usersWithRoles,
      stats,
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to fetch users", 500);
  }
}
