/**
 * 벡터 검색 테스트 유틸리티
 * RPC 함수를 직접 테스트하기 위한 헬퍼
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { createEmbedding } from "./embedding";

const supabase = getSupabaseServer();

/**
 * 벡터 검색 직접 테스트
 */
export async function testVectorSearch(examId: string, query: string) {
  // 1. 임베딩 생성
  const queryEmbedding = await createEmbedding(query);

  // 2. DB에서 직접 벡터 확인
  const { data: chunks, error: chunksError } = await supabase
    .from("exam_material_chunks")
    .select("id, content, embedding")
    .eq("exam_id", examId)
    .limit(3);

  if (chunksError) {
    return;
  }

  // 3. RPC 함수 테스트 (임계값 0.0으로 모든 결과 가져오기)
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
    return;
  }

  return { chunks, rpcData, rpcError };
}
