// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createEmbedding } from "@/lib/embedding";

/**
 * POST /api/embed
 * 텍스트를 임베딩 벡터로 변환하는 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "text 필드가 필요합니다 (문자열)" },
        { status: 400 }
      );
    }

    if (text.trim().length === 0) {
      return NextResponse.json(
        { error: "텍스트가 비어있습니다" },
        { status: 400 }
      );
    }

    console.log("[embed] 임베딩 생성 시작, 텍스트 길이:", text.length);

    const embedding = await createEmbedding(text);

    console.log("[embed] 임베딩 생성 완료, 차원:", embedding.length);

    return NextResponse.json({
      success: true,
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    console.error("[embed] 에러:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "임베딩 생성 실패",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
