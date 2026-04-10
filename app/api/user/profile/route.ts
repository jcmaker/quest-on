import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";

const PatchSchema = z.object({
  role: z.enum(["instructor", "student"]),
  status: z.enum(["pending", "approved"]).optional(),
});

// 현재 유저의 role/status 업데이트 (온보딩 시 사용)
export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const rl = await checkRateLimitAsync(
      `user-profile:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests.", 429);
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid role or status", 400);
    }

    const { role, status } = parsed.data;
    const resolvedStatus = status ?? (role === "instructor" ? "pending" : "approved");

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("profiles")
      .update({
        role,
        status: resolvedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) throw error;

    return successJson({ updated: true });
  } catch {
    return errorJson("UPDATE_FAILED", "Failed to update profile", 500);
  }
}
