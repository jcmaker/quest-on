import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { errorJson } from "@/lib/api-response";

export async function POST(_request: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return errorJson("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (user.role !== "instructor") {
    return errorJson("FORBIDDEN", "Forbidden", 403);
  }

  return errorJson(
    "DEPRECATED_ROUTE",
    "이 경로는 비활성화되었습니다. 종합 요약 평가는 /api/session/:sessionId/grade 자동 채점 경로에서만 생성됩니다.",
    410
  );
}
