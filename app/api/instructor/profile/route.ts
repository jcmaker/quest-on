import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);

    const body = await request.json();
    const { name, email } = body;

    const supabase = getSupabaseServer();

    const { error } = await supabase
      .from("instructor_profiles")
      .upsert({
        id: user.id,
        name: name || "",
        email: email || "",
        status: "pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) {
      logError("[instructor-profile] Failed to create profile", error, {
        path: "/api/instructor/profile",
      });
      return errorJson("DATABASE_ERROR", "Failed to create profile", 500);
    }

    return successJson({ created: true });
  } catch (error) {
    logError("[instructor-profile] Unhandled error", error, {
      path: "/api/instructor/profile",
    });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
