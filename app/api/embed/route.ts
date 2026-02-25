// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createEmbedding } from "@/lib/embedding";
import { successJson, errorJson } from "@/lib/api-response";

/**
 * POST /api/embed
 * 텍스트를 임베딩 벡터로 변환하는 API
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check - only instructors should generate embeddings
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return errorJson("BAD_REQUEST", "text 필드가 필요합니다 (문자열)", 400);
    }

    if (text.trim().length === 0) {
      return errorJson("BAD_REQUEST", "텍스트가 비어있습니다", 400);
    }

    const embedding = await createEmbedding(text);

    return successJson({
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return errorJson("INTERNAL_ERROR", "임베딩 생성 실패", 500, errorMessage);
  }
}
