// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import {
  searchMaterialChunks,
  formatSearchResultsAsContext,
} from "@/lib/search-chunks";

/**
 * POST /api/search-materials
 * 질문을 기반으로 관련 수업 자료 검색 (RAG)
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { query, examId, matchThreshold, matchCount } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "query 필드가 필요합니다 (문자열)" },
        { status: 400 }
      );
    }

    console.log("[search-materials] 검색 요청:", {
      query: query.substring(0, 100),
      examId,
      matchThreshold,
      matchCount,
    });

    // 벡터 유사도 검색
    const results = await searchMaterialChunks(query, {
      examId,
      matchThreshold: matchThreshold || 0.5,
      matchCount: matchCount || 5,
    });

    // 컨텍스트 문자열 생성
    const context = formatSearchResultsAsContext(results);

    return NextResponse.json({
      success: true,
      results,
      context,
      count: results.length,
    });
  } catch (error) {
    console.error("[search-materials] 에러:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: "검색 실패",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
