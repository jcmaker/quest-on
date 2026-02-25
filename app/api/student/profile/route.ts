import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { successJson, errorJson } from "@/lib/api-response";

// 프로필 조회
export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    // Prisma를 사용하여 프로필 조회
    console.log("[Profile API] Fetching profile for student_id:", user.id);
    const profile = await prisma.student_profiles.findUnique({
      where: { student_id: user.id },
    });
    console.log("[Profile API] Profile found:", profile ? "yes" : "no");

    return successJson({ profile });
  } catch (error) {
    console.error("[Profile API] Error fetching profile:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Profile API] Error stack:", errorStack);
    return errorJson(
      "FETCH_PROFILE_FAILED",
      "Failed to fetch profile",
      500,
      {
        message: errorMessage,
        ...(process.env.NODE_ENV === "development" && { stack: errorStack }),
      }
    );
  }
}

// 프로필 생성/업데이트
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Check if user is student
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const { name, student_number, school } = await request.json();

    // Validation
    if (!name || !student_number || !school) {
      return errorJson("MISSING_FIELDS", "Name, student number, and school are required", 400);
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

    return successJson({ profile });
  } catch (error) {
    console.error("Error saving profile:", error);
    return errorJson("SAVE_PROFILE_FAILED", "Failed to save profile", 500);
  }
}
