import { NextRequest, NextResponse } from "next/server";
import { currentUser, auth } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/nextjs/server";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

/**
 * Revoke all other Clerk sessions except the current one
 * This ensures only one device can be logged in at a time
 *
 * NOTE: This function is called when starting an exam to prevent
 * concurrent access from multiple devices with the same account.
 */
export async function POST(request: NextRequest) {
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

    // Get all active sessions for this user
    const sessions = await clerk.sessions.getSessionList({
      userId: user.id,
    });

    console.log(
      `[REVOKE_SESSIONS] Found ${sessions.data.length} sessions for user ${user.id}, current: ${currentSessionId}`
    );

    // Revoke all sessions except the current one
    const revokedSessions: string[] = [];
    for (const session of sessions.data) {
      // Skip the current session
      if (session.id === currentSessionId) {
        console.log(
          `[REVOKE_SESSIONS] Skipping current session: ${session.id}`
        );
        continue;
      }

      try {
        await clerk.sessions.revokeSession(session.id);
        revokedSessions.push(session.id);
        console.log(`[REVOKE_SESSIONS] Revoked session: ${session.id}`);
      } catch (error) {
        console.error(
          `[REVOKE_SESSIONS] Error revoking session ${session.id}:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      revokedCount: revokedSessions.length,
      currentSessionId,
      message: `Revoked ${revokedSessions.length} other session(s), keeping current session active`,
    });
  } catch (error) {
    console.error("[REVOKE_SESSIONS] Error:", error);
    return NextResponse.json(
      { error: "Failed to revoke sessions" },
      { status: 500 }
    );
  }
}
