import { NextRequest, NextResponse } from "next/server";
import { currentUser, auth } from "@clerk/nextjs/server";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current session ID from auth result
    const currentSessionId = authResult.sessionId;

    if (!currentSessionId) {
      // If no current session, just return success (nothing to revoke)
      return NextResponse.json({
        success: true,
        revokedCount: 0,
        message: "No active session found, nothing to revoke",
      });
    }

    return NextResponse.json({
      success: true,
      revokedCount: 0,
      currentSessionId,
      message:
        "Session revocation is temporarily disabled. No sessions were revoked.",
    });
  } catch (error) {
    console.error("[REVOKE_SESSIONS] Error:", error);
    return NextResponse.json(
      { error: "Failed to revoke sessions" },
      { status: 500 }
    );
  }
}
