import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;
    const { role } = await request.json();

    if (!role || !["instructor", "student"].includes(role)) {
      return errorJson("BAD_REQUEST", "Invalid role. Must be 'instructor' or 'student'", 400);
    }

    const supabase = getSupabaseServer();

    // profiles 테이블에서 role 업데이트
    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${userId},clerk_id.eq.${userId}`)
      .select("id, email, full_name, role")
      .single();

    if (error) {
      return errorJson("NOT_FOUND", "User not found", 404);
    }

    return successJson({
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
      },
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to update user role", 500);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { userId } = await params;
    const supabase = getSupabaseServer();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, avatar_url, created_at, clerk_id")
      .or(`id.eq.${userId},clerk_id.eq.${userId}`)
      .single();

    if (error || !profile) {
      return errorJson("NOT_FOUND", "User not found", 404);
    }

    return successJson({
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        status: profile.status,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        clerkId: profile.clerk_id,
      },
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to fetch user", 500);
  }
}
