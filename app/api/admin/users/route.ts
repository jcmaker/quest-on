import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 100 : rawLimit, 1), 500);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    const supabase = getSupabaseServer();
    const { data: users, count, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, avatar_url, created_at, clerk_id", {
        count: "exact",
      })
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const total = count ?? 0;
    const usersWithRoles = (users ?? []).map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role || "student",
      status: user.status,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      clerkId: user.clerk_id,
    }));

    const stats = {
      total,
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
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logError("Failed to fetch users", error, { path: "/api/admin/users" });
    return errorJson("INTERNAL_ERROR", "Failed to fetch users", 500);
  }
}
