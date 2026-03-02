import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminToken } from "@/lib/admin-auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, adminAuthSchema } from "@/lib/validations";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP to prevent brute force (skip in test mode)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!process.env.TEST_BYPASS_SECRET) {
      const rl = checkRateLimit(`admin-login:${ip}`, RATE_LIMITS.adminLogin);
      if (!rl.allowed) {
        return errorJson("RATE_LIMITED", "Too many login attempts. Please try again later.", 429);
      }
    }

    const body = await request.json();
    const validation = validateRequest(adminAuthSchema, body);
    if (!validation.success) {
      return errorJson("BAD_REQUEST", validation.error!, 400);
    }

    const { username, password } = validation.data;

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      return errorJson("INTERNAL_ERROR", "Admin credentials not configured", 500);
    }

    if (username === adminUsername && password === adminPassword) {
      const token = createAdminToken();

      const cookieStore = await cookies();
      cookieStore.set("admin-session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60, // 24 hours
        path: "/",
      });

      auditLog({
        action: "admin_login_success",
        userId: "admin",
        targetId: "admin-session",
        details: { ip, username },
      });

      return successJson();
    } else {
      auditLog({
        action: "admin_login_failure",
        userId: "anonymous",
        targetId: "admin-session",
        details: { ip, username },
      });

      return errorJson("UNAUTHORIZED", "Invalid credentials", 401);
    }
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("admin-session");
    return successJson();
  } catch (error) {
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
