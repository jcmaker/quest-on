import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createAdminToken } from "@/lib/admin-auth";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { validateRequest, adminAuthSchema } from "@/lib/validations";
import { successJson, errorJson } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";

/** Constant-time string comparison to prevent timing attacks */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP to prevent brute force (always applied)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimitAsync(`admin-login:${ip}`, RATE_LIMITS.adminLogin);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many login attempts. Please try again later.", 429);
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

    if (timingSafeCompare(username, adminUsername) && timingSafeCompare(password, adminPassword)) {
      const token = createAdminToken();

      const cookieStore = await cookies();
      cookieStore.set("admin-session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60, // 24 hours
        path: "/",
      });

      try {
        await auditLog({
          action: "admin_login_success",
          userId: "admin",
          targetId: "admin-session",
          details: { ip, username },
        });
      } catch (auditError) {
        logError("[admin-auth] Audit log failed for login success", auditError, { path: "/api/admin/auth" });
      }

      return successJson();
    } else {
      try {
        await auditLog({
          action: "admin_login_failure",
          userId: "anonymous",
          targetId: "admin-session",
          details: { ip, username },
        });
      } catch (auditError) {
        logError("[admin-auth] Audit log failed for login failure", auditError, { path: "/api/admin/auth" });
      }

      return errorJson("UNAUTHORIZED", "Invalid credentials", 401);
    }
  } catch (error) {
    logError("Admin auth POST failed", error, { path: "/api/admin/auth" });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("admin-session");
    return successJson();
  } catch (error) {
    logError("Admin auth DELETE failed", error, { path: "/api/admin/auth" });
    return errorJson("INTERNAL_ERROR", "Internal server error", 500);
  }
}
