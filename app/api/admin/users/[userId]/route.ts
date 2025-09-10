import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin-auth";

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
    await requireAdmin();

    const { userId } = await params;
    const { role } = await request.json();

    // Role 유효성 검사
    if (!role || !["instructor", "student"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'instructor' or 'student'" },
        { status: 400 }
      );
    }

    // 사용자 정보 업데이트
    const updatedUser = await clerk.users.updateUser(userId, {
      unsafeMetadata: { role },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.emailAddresses[0]?.emailAddress,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.unsafeMetadata?.role as string,
      },
    });
  } catch (error) {
    console.error("Error updating user role:", error);

    if (error instanceof Error && error.message === "Admin access required") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update user role" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // 어드민 인증 확인
    await requireAdmin();

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

    return NextResponse.json({ user: userInfo });
  } catch (error) {
    console.error("Error fetching user:", error);

    if (error instanceof Error && error.message === "Admin access required") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
