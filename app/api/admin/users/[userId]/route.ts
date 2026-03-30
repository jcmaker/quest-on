import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

// Clerk 클라이언트 직접 초기화
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // 어드민 인증 확인
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;
    const { role } = await request.json();

    // Role 유효성 검사
    if (!role || !["instructor", "student"].includes(role)) {
      return errorJson("BAD_REQUEST", "Invalid role. Must be 'instructor' or 'student'", 400);
    }

    // 사용자 정보 업데이트
    const updatedUser = await clerk.users.updateUser(userId, {
      unsafeMetadata: { role },
    });

    return successJson({
      user: {
        id: updatedUser.id,
        email: updatedUser.emailAddresses[0]?.emailAddress,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.unsafeMetadata?.role as string,
      },
    });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to update user role", 500);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // 어드민 인증 확인
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;

    // 특정 사용자 정보 가져오기
    const user = await clerk.users.getUser(userId);

    const userInfo = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      role: (user.unsafeMetadata?.role as string) || "student",
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      imageUrl: user.imageUrl,
      publicMetadata: user.publicMetadata,
      unsafeMetadata: user.unsafeMetadata,
    };

    return successJson({ user: userInfo });
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Failed to fetch user", 500);
  }
}
