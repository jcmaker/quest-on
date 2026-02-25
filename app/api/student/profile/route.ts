import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";

const supabase = getSupabaseServer();

// 프로필 조회
export async function GET() {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const { data: profile, error } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("student_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return successJson({ profile: profile || null });
  } catch (error) {
    return errorJson("FETCH_PROFILE_FAILED", "Failed to fetch profile", 500);
  }
}

// 프로필 생성/업데이트
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "student") {
      return errorJson("STUDENT_ACCESS_REQUIRED", "Student access required", 403);
    }

    const { name, student_number, school } = await request.json();

    if (!name || !student_number || !school) {
      return errorJson("MISSING_FIELDS", "Name, student number, and school are required", 400);
    }

    // Upsert profile using Supabase
    const { data: profile, error } = await supabase
      .from("student_profiles")
      .upsert(
        {
          student_id: user.id,
          name,
          student_number,
          school,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" }
      )
      .select()
      .single();

    if (error) throw error;

    return successJson({ profile });
  } catch (error) {
    return errorJson("SAVE_PROFILE_FAILED", "Failed to save profile", 500);
  }
}
