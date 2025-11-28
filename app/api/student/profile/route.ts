import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// 프로필 조회
export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return NextResponse.json(
        { error: "Student access required" },
        { status: 403 }
      );
    }

    // Prisma를 사용하여 프로필 조회
    console.log("[Profile API] Fetching profile for student_id:", user.id);
    const profile = await prisma.student_profiles.findUnique({
      where: { student_id: user.id },
    });
    console.log("[Profile API] Profile found:", profile ? "yes" : "no");

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[Profile API] Error fetching profile:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Profile API] Error stack:", errorStack);
    return NextResponse.json(
      {
        error: "Failed to fetch profile",
        details: errorMessage,
        // 개발 환경에서만 스택 트레이스 포함
        ...(process.env.NODE_ENV === "development" && { stack: errorStack }),
      },
      { status: 500 }
    );
  }
}

// 프로필 생성/업데이트
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return NextResponse.json(
        { error: "Student access required" },
        { status: 403 }
      );
    }

    const { name, student_number, school } = await request.json();

    // Validation
    if (!name || !student_number || !school) {
      return NextResponse.json(
        { error: "Name, student number, and school are required" },
        { status: 400 }
      );
    }

    // Upsert profile (create or update)
    const profile = await prisma.student_profiles.upsert({
      where: { student_id: user.id },
      update: {
        name,
        student_number,
        school,
        updated_at: new Date(),
      },
      create: {
        student_id: user.id,
        name,
        student_number,
        school,
      },
    });

    return NextResponse.json({ profile, success: true });
  } catch (error) {
    console.error("Error saving profile:", error);
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 500 }
    );
  }
}
