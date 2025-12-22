// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/debug-vector-search
 * 벡터 검색 디버깅용 API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { examId, query } = body;

    if (!examId || !query) {
      return NextResponse.json(
        { error: "examId와 query가 필요합니다" },
        { status: 400 }
      );
    }

    console.log("🧪 [debug-vector-search] 디버깅 시작:", { examId, query });

    // 1. 임베딩 생성
    const queryEmbedding = await createEmbedding(query);
    console.log("✅ 임베딩 생성:", { dimensions: queryEmbedding.length });

    // 2. DB에서 벡터 직접 확인
    const { data: chunks, error: chunksError } = await supabase
      .from("exam_material_chunks")
      .select("id, content, embedding")
      .eq("exam_id", examId)
      .limit(5);

    if (chunksError) {
      return NextResponse.json(
        { error: "청크 조회 실패", details: chunksError },
        { status: 500 }
      );
    }

    const chunksWithEmbedding =
      chunks?.filter((c) => c.embedding !== null).length || 0;

    console.log("📊 저장된 청크 상태:", {
      total: chunks?.length || 0,
      withEmbedding: chunksWithEmbedding,
    });

    // 3. RPC 함수 테스트 (임계값 0.0으로 모든 결과)
    console.log("🔎 RPC 함수 테스트 (임계값 0.0)...");
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "match_exam_materials",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.0,
        match_count: 10,
        p_exam_id: examId,
      }
    );

    if (rpcError) {
      console.error("❌ RPC 함수 에러:", rpcError);
      return NextResponse.json(
        {
          error: "RPC 함수 실패",
          details: rpcError,
          chunksInfo: {
            total: chunks?.length || 0,
            withEmbedding: chunksWithEmbedding,
          },
        },
        { status: 500 }
      );
    }

    // 4. 직접 SQL로 유사도 계산 테스트 (RPC 함수 대신)
    console.log("🔎 직접 SQL 쿼리 테스트...");

    // PostgreSQL의 vector 연산자를 직접 사용하는 쿼리는 Supabase JS 클라이언트로는 불가능
    // 대신 RPC 함수 결과를 분석

    return NextResponse.json({
      success: true,
      examId,
      query,
      embeddingDimensions: queryEmbedding.length,
      chunksInfo: {
        total: chunks?.length || 0,
        withEmbedding: chunksWithEmbedding,
        sampleChunks: chunks?.slice(0, 3).map((c) => ({
          id: c.id,
          contentLength: c.content?.length || 0,
          hasEmbedding: c.embedding !== null,
        })),
      },
      rpcResults: {
        resultsCount: rpcData?.length || 0,
        results: rpcData?.map((r: any) => ({
          id: r.id,
          similarity: r.similarity?.toFixed(4),
          contentPreview: r.content?.substring(0, 100),
        })),
      },
    });
  } catch (error) {
    console.error("❌ 디버깅 에러:", error);
    return NextResponse.json(
      {
        error: "디버깅 실패",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
