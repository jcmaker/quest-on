import { NextRequest, NextResponse } from "next/server";
import { currentUser, auth } from "@clerk/nextjs/server";
import { successJson, errorJson } from "@/lib/api-response";

/**
 * NOTE: Temporarily disabled.
 * 동시 접속(멀티 디바이스/멀티 세션)을 막는 방식이 변경될 예정이라,
 * 그 전까지는 다른 세션을 강제로 revoke 하지 않습니다.
 */
export async function POST(_request: NextRequest) {
  try {
    const user = await currentUser();
    const authResult = await auth();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    // Get current session ID from auth result
    const currentSessionId = authResult.sessionId;

    if (!currentSessionId) {
      // If no current session, just return success (nothing to revoke)
      return successJson({
        revokedCount: 0,
        message: "No active session found, nothing to revoke",
      });
    }

    return successJson({
      revokedCount: 0,
      currentSessionId,
      message:
        "Session revocation is temporarily disabled. No sessions were revoked.",
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to revoke sessions", 500);
  }
}
