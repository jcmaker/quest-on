/**
 * 벡터 검색 테스트 유틸리티
 * RPC 함수를 직접 테스트하기 위한 헬퍼
 */

import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "./embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 벡터 검색 직접 테스트
 */
export async function testVectorSearch(examId: string, query: string) {
  console.log("🧪 [test-vector-search] 테스트 시작:", { examId, query });

  // 1. 임베딩 생성
  const queryEmbedding = await createEmbedding(query);
  console.log("✅ 임베딩 생성:", { dimensions: queryEmbedding.length });

  // 2. DB에서 직접 벡터 확인
  const { data: chunks, error: chunksError } = await supabase
    .from("exam_material_chunks")
    .select("id, content, embedding")
    .eq("exam_id", examId)
    .limit(3);

  if (chunksError) {
    console.error("❌ 청크 조회 실패:", chunksError);
    return;
  }

  console.log("📊 저장된 청크 샘플:", {
    count: chunks?.length || 0,
    samples: chunks?.map((c) => ({
      id: c.id,
      contentLength: c.content?.length || 0,
      hasEmbedding: c.embedding !== null,
      embeddingType: typeof c.embedding,
    })),
  });

  // 3. RPC 함수 테스트 (임계값 0.0으로 모든 결과 가져오기)
  console.log("🔎 RPC 함수 테스트 (임계값 0.0)...");
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "match_exam_materials",
    {
      query_embedding: queryEmbedding,
      match_threshold: 0.0, // 모든 결과
      match_count: 10,
      p_exam_id: examId,
    }
  );

  if (rpcError) {
    console.error("❌ RPC 함수 에러:", {
      message: rpcError.message,
      code: rpcError.code,
      details: rpcError.details,
      hint: rpcError.hint,
    });
    return;
  }

  console.log("📥 RPC 함수 결과:", {
    resultsCount: rpcData?.length || 0,
    results: rpcData?.map((r: any) => ({
      id: r.id,
      similarity: r.similarity?.toFixed(4),
      contentPreview: r.content?.substring(0, 50),
    })),
  });

  return { chunks, rpcData, rpcError };
}
