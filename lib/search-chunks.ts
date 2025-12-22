/**
 * 벡터 유사도 검색 유틸리티
 */

import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "./embedding";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SearchResult {
  id: string;
  content: string;
  fileUrl: string;
  similarity: number;
  metadata: {
    fileName: string;
    fileUrl: string;
    chunkIndex: number;
    startChar: number;
    endChar: number;
  };
}

export interface SearchOptions {
  examId?: string; // 시험 ID (선택적, 없으면 전체 검색)
  matchThreshold?: number; // 유사도 임계값 (0-1, 기본값: 0.5)
  matchCount?: number; // 반환할 결과 수 (기본값: 5)
}

/**
 * 질문 텍스트로 관련 자료 검색
 * @param queryText 검색할 질문 텍스트
 * @param options 검색 옵션
 * @returns 검색 결과 배열
 */
export async function searchMaterialChunks(
  queryText: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // 기본 임계값을 0.2로 낮춤 (실제 유사도가 0.2~0.4 정도이므로)
  const { examId, matchThreshold = 0.2, matchCount = 5 } = options;

  console.log("🔍 [search-chunks] 벡터 검색 시작:", {
    queryPreview: queryText.substring(0, 100),
    examId: examId || "전체 검색",
    matchThreshold,
    matchCount,
  });

  try {
    // 1. 질문을 임베딩 벡터로 변환
    console.log("📝 [search-chunks] 질문 임베딩 생성 시작...");
    const embeddingStartTime = Date.now();
    const queryEmbedding = await createEmbedding(queryText);
    const embeddingDuration = Date.now() - embeddingStartTime;

    console.log("✅ [search-chunks] 질문 임베딩 생성 완료:", {
      dimensions: queryEmbedding.length,
      duration: `${embeddingDuration}ms`,
      embeddingPreview: queryEmbedding.slice(0, 5).map((v) => v.toFixed(4)),
    });

    // 2. DB에 저장된 청크 수 및 벡터 상태 확인 (디버깅용)
    if (examId) {
      // 전체 청크 수 확인
      const { count } = await supabase
        .from("exam_material_chunks")
        .select("*", { count: "exact", head: true })
        .eq("exam_id", examId);

      // 벡터가 있는 청크 수 확인
      const { count: countWithEmbedding } = await supabase
        .from("exam_material_chunks")
        .select("*", { count: "exact", head: true })
        .eq("exam_id", examId)
        .not("embedding", "is", null);

      // 샘플 데이터 확인
      const { data: sampleData } = await supabase
        .from("exam_material_chunks")
        .select("id, embedding")
        .eq("exam_id", examId)
        .limit(5);

      const chunksWithEmbedding =
        sampleData?.filter((item) => item.embedding !== null).length || 0;

      console.log("📊 [search-chunks] DB 청크 상태 확인:", {
        examId,
        totalChunks: count || 0,
        chunksWithEmbedding: countWithEmbedding || 0,
        sampleChunksWithEmbedding: chunksWithEmbedding,
        sampleIds: sampleData?.map((item) => ({
          id: item.id,
          hasEmbedding: item.embedding !== null,
        })),
      });

      if ((countWithEmbedding || 0) === 0 && (count || 0) > 0) {
        console.error(
          "⚠️ [search-chunks] 경고: 청크는 있지만 벡터가 저장되지 않았습니다!"
        );
        return [];
      }
    }

    // 3. Supabase RPC 함수로 유사도 검색
    // Supabase는 JavaScript 배열을 자동으로 vector 타입으로 변환합니다
    console.log("🔎 [search-chunks] RPC 함수 호출 시작...");
    console.log("🔍 [search-chunks] RPC 함수 파라미터:", {
      queryEmbeddingLength: queryEmbedding.length,
      queryEmbeddingType: Array.isArray(queryEmbedding)
        ? "array"
        : typeof queryEmbedding,
      queryEmbeddingPreview: queryEmbedding.slice(0, 5),
      matchThreshold,
      matchCount,
      p_exam_id: examId || null,
    });

    const searchStartTime = Date.now();

    // 배열 형식으로 전달 (Supabase가 자동 변환)
    // 먼저 임계값 0.0으로 모든 결과 가져와서 실제 유사도 확인
    console.log("🔍 [search-chunks] 먼저 임계값 0.0으로 모든 결과 확인...");
    const { data: allResults, error: allError } = await supabase.rpc(
      "match_exam_materials",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.0, // 모든 결과
        match_count: 20, // 더 많이 가져오기
        p_exam_id: examId || null,
      }
    );

    if (allError) {
      console.error("❌ [search-chunks] RPC 함수 호출 실패 (임계값 0.0):", {
        error: allError.message,
        code: allError.code,
        details: allError.details,
        hint: allError.hint,
      });
      throw allError;
    }

    console.log("📊 [search-chunks] 임계값 0.0 결과:", {
      resultsCount: allResults?.length || 0,
      similarities: allResults?.map((r: any) => ({
        id: r.id,
        similarity: r.similarity?.toFixed(4),
      })),
      topSimilarity: allResults?.[0]?.similarity?.toFixed(4) || "N/A",
      minSimilarity:
        allResults?.[allResults.length - 1]?.similarity?.toFixed(4) || "N/A",
    });

    // 실제 유사도가 있는 결과만 필터링
    const validResults = (allResults || []).filter(
      (r: any) => r.similarity && r.similarity > matchThreshold
    );

    console.log("🎯 [search-chunks] 필터링된 결과:", {
      originalCount: allResults?.length || 0,
      filteredCount: validResults.length,
      threshold: matchThreshold,
    });

    const searchDuration = Date.now() - searchStartTime;

    // 원래 요청한 개수만큼 반환
    const data = validResults.slice(0, matchCount);

    console.log("📥 [search-chunks] 최종 결과:", {
      resultsCount: data?.length || 0,
      duration: `${searchDuration}ms`,
      topSimilarity: data?.[0]?.similarity?.toFixed(4) || "N/A",
    });

    if (!data || data.length === 0) {
      console.log("⚠️ [search-chunks] 검색 결과 없음:", {
        examId: examId || "전체",
        matchThreshold,
        allResultsCount: allResults?.length || 0,
        message:
          allResults && allResults.length > 0
            ? `임계값 ${matchThreshold}이 너무 높습니다. 실제 최고 유사도: ${allResults[0]?.similarity?.toFixed(
                4
              )}`
            : "RPC 함수가 결과를 반환하지 않았습니다",
      });

      // 실제 유사도가 낮더라도 상위 결과 반환 (임계값 무시)
      if (allResults && allResults.length > 0) {
        console.log("⚠️ [search-chunks] 임계값 무시하고 상위 결과 반환:", {
          resultsCount: Math.min(allResults.length, matchCount),
          topSimilarity: allResults[0]?.similarity?.toFixed(4),
        });

        const results: SearchResult[] = allResults
          .slice(0, matchCount)
          .map((item: any) => ({
            id: item.id,
            content: item.content,
            fileUrl: item.file_url,
            similarity: item.similarity,
            metadata: item.metadata || {},
          }));
        return results;
      }

      return [];
    }

    // 4. 결과 포맷팅
    const results: SearchResult[] = data.map((item: any) => ({
      id: item.id,
      content: item.content,
      fileUrl: item.file_url,
      similarity: item.similarity,
      metadata: item.metadata || {},
    }));

    console.log("🎯 [search-chunks] 검색 완료:", {
      resultsCount: results.length,
      topSimilarity: results[0]?.similarity?.toFixed(3) || "N/A",
      similarityRange:
        results.length > 0
          ? `${
              results[results.length - 1]?.similarity?.toFixed(3) || "N/A"
            } ~ ${results[0]?.similarity?.toFixed(3) || "N/A"}`
          : "N/A",
      fileNames: results.map((r) => r.metadata?.fileName || "unknown"),
      topResultPreview: results[0]?.content?.substring(0, 100) || "",
    });

    return results;
  } catch (error) {
    console.error("❌ [search-chunks] 검색 중 에러:", {
      queryPreview: queryText.substring(0, 100),
      examId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(
      `검색 실패: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 검색 결과를 컨텍스트 문자열로 변환 (프롬프트에 사용)
 * @param results 검색 결과 배열
 * @returns 컨텍스트 문자열
 */
export function formatSearchResultsAsContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  return results
    .map((result, index) => {
      const fileName =
        result.metadata?.fileName ||
        result.fileUrl.split("/").pop() ||
        "unknown";
      return `[자료 ${index + 1}: ${fileName}]\n${result.content}`;
    })
    .join("\n\n---\n\n");
}
