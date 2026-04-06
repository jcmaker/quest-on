import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

export async function POST() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return errorJson("CONFIG_ERROR", "CLERK_SECRET_KEY not set", 500);
    }

    // Fetch all users from Clerk (paginated, max 100 per page)
    let allUsers: Array<{
      id: string;
      email_addresses: Array<{ email_address: string }>;
      first_name: string;
      last_name: string;
      unsafe_metadata: { role?: string; status?: string };
    }> = [];

    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(
        `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${clerkSecretKey}` },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch Clerk users");
      const users = await res.json();
      if (!Array.isArray(users) || users.length === 0) break;
      allUsers = [...allUsers, ...users];
      if (users.length < limit) break;
      offset += limit;
    }

    // Filter instructors only
    const instructors = allUsers.filter(
      (u) => u.unsafe_metadata?.role === "instructor"
    );

    const supabase = getSupabaseServer();
    const results = { success: 0, failed: 0, skipped: 0 };

    for (const instructor of instructors) {
      try {
        const email = instructor.email_addresses?.[0]?.email_address || "";
        const name = [instructor.first_name, instructor.last_name]
          .filter(Boolean)
          .join(" ");

        // Skip if already approved
        if (instructor.unsafe_metadata?.status === "approved") {
          results.skipped++;
          continue;
        }

        // Upsert instructor_profiles
        const { error: dbError } = await supabase
          .from("instructor_profiles")
          .upsert(
            {
              id: instructor.id,
              name,
              email,
              status: "approved",
              approved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (dbError) {
          logError("[migrate] DB upsert failed", dbError, {
            path: "/api/admin/instructors/migrate",
            additionalData: { instructorId: instructor.id },
          });
          results.failed++;
          continue;
        }

        // Update Clerk unsafeMetadata
        const clerkRes = await fetch(
          `https://api.clerk.com/v1/users/${instructor.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${clerkSecretKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              unsafe_metadata: {
                ...instructor.unsafe_metadata,
                role: "instructor",
                status: "approved",
              },
            }),
          }
        );

        if (!clerkRes.ok) {
          logError("[migrate] Clerk update failed", await clerkRes.text(), {
            path: "/api/admin/instructors/migrate",
            additionalData: { instructorId: instructor.id },
          });
          results.failed++;
          continue;
        }

        results.success++;
      } catch (err) {
        logError("[migrate] Unexpected error", err, {
          path: "/api/admin/instructors/migrate",
          additionalData: { instructorId: instructor.id },
        });
        results.failed++;
      }
    }

    return successJson({
      total: instructors.length,
      ...results,
    });
  } catch (error) {
    logError("[migrate] Unhandled error", error, {
      path: "/api/admin/instructors/migrate",
    });
    return errorJson("INTERNAL_ERROR", "Migration failed", 500);
  }
}
