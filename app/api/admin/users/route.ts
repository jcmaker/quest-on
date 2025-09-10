import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";

// Clerk 클라이언트 직접 초기화
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function GET() {
  try {
    // 어드민 인증 확인
    await requireAdmin();

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

    return NextResponse.json({
      users: usersWithRoles,
      stats,
    });
  } catch (error) {
    console.error("Error fetching users:", error);

    if (error instanceof Error && error.message === "Admin access required") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
