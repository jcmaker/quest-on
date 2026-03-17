/**
 * 벡터 유사도 검색 유틸리티
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { createEmbedding } from "./embedding";
import { decompressChunkContent } from "./save-chunks";

const supabase = getSupabaseServer();

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
  route?: string;
  userId?: string;
  sessionId?: string;
  qIdx?: number;
  metadata?: Record<string, unknown>;
}

/** Supabase RPC match_exam_materials 함수 반환 타입 */
interface MatchExamMaterialsRow {
  id: string;
  content: string;
  file_url: string;
  similarity: number;
  metadata: {
    fileName?: string;
    fileUrl?: string;
    chunkIndex?: number;
    startChar?: number;
    endChar?: number;
  } | null;
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
  const {
    examId,
    matchThreshold = 0.2,
    matchCount = 5,
    route,
    userId,
    sessionId,
    qIdx,
    metadata,
  } = options;

  try {
    // 1. 질문을 임베딩 벡터로 변환
    const queryEmbedding = await createEmbedding(queryText, {
      route: route ?? "/lib/search-chunks",
      userId,
      examId,
      sessionId,
      qIdx,
      metadata,
    });

    // 2. DB에 저장된 청크 수 및 벡터 상태 확인
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

      if ((countWithEmbedding || 0) === 0 && (count || 0) > 0) {
        return [];
      }
    }

    // 3. Supabase RPC 함수로 유사도 검색
    // 배열 형식으로 전달 (Supabase가 자동 변환)
    // 먼저 임계값 0.0으로 모든 결과 가져와서 실제 유사도 확인
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
      throw allError;
    }

    const typedResults = (allResults || []) as MatchExamMaterialsRow[];

    // 실제 유사도가 있는 결과만 필터링
    const validResults = typedResults.filter(
      (r) => r.similarity && r.similarity > matchThreshold
    );

    // 원래 요청한 개수만큼 반환
    const data = validResults.slice(0, matchCount);

    const defaultMetadata: SearchResult["metadata"] = {
      fileName: "",
      fileUrl: "",
      chunkIndex: 0,
      startChar: 0,
      endChar: 0,
    };

    const mapToSearchResult = (item: MatchExamMaterialsRow): SearchResult => ({
      id: item.id,
      content: decompressChunkContent(item.content),
      fileUrl: item.file_url,
      similarity: item.similarity,
      metadata: {
        fileName: item.metadata?.fileName ?? defaultMetadata.fileName,
        fileUrl: item.metadata?.fileUrl ?? defaultMetadata.fileUrl,
        chunkIndex: item.metadata?.chunkIndex ?? defaultMetadata.chunkIndex,
        startChar: item.metadata?.startChar ?? defaultMetadata.startChar,
        endChar: item.metadata?.endChar ?? defaultMetadata.endChar,
      },
    });

    if (!data || data.length === 0) {
      // 실제 유사도가 낮더라도 상위 결과 반환 (임계값 무시)
      if (typedResults.length > 0) {
        return typedResults
          .slice(0, matchCount)
          .map(mapToSearchResult);
      }

      return [];
    }

    // 4. 결과 포맷팅
    const results: SearchResult[] = data.map(mapToSearchResult);

    return results;
  } catch (error) {
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
