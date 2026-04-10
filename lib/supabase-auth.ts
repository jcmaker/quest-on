import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

export type AppUser = {
  id: string; // Supabase UUID
  email: string;
  role: "instructor" | "student";
  status: "pending" | "approved";
  fullName: string | null;
  avatarUrl: string | null;
};

export async function getSupabaseAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

export async function currentUser(): Promise<AppUser | null> {
  // 테스트 바이패스 (기존 패턴 유지 — auth 시스템 비의존적)
  const bypassSecret = process.env.TEST_BYPASS_SECRET;
  if (bypassSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[SECURITY] TEST_BYPASS_SECRET must not be set in production."
      );
    }
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const token = hdrs.get("x-test-bypass-token");

    if (
      token &&
      token.length === bypassSecret.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(bypassSecret))
    ) {
      const testId = hdrs.get("x-test-user-id");
      const testRole = (hdrs.get("x-test-user-role") ?? "student") as AppUser["role"];
      if (testId) {
        return {
          id: testId,
          email: `${testId}@test.local`,
          role: testRole,
          status: "approved",
          fullName: "Test User",
          avatarUrl: null,
        };
      }
    }
    return null;
  }

  const supabase = await getSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as AppUser["role"],
    status: (profile.status ?? "approved") as AppUser["status"],
    fullName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  };
}
