import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";

/**
 * NOTE: Temporarily disabled.
 * 동시 접속(멀티 디바이스/멀티 세션)을 막는 방식이 변경될 예정이라,
 * 그 전까지는 다른 세션을 강제로 revoke 하지 않습니다.
 */
export async function POST(_request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    return successJson({
      revokedCount: 0,
      message:
        "Session revocation is temporarily disabled. No sessions were revoked.",
    });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to revoke sessions", 500);
  }
}
