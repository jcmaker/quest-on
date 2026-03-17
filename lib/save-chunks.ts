/**
 * 청크를 DB에 저장하는 유틸리티
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import LZString from "lz-string";

const supabase = getSupabaseServer();

const LZ_PREFIX = "LZ:";

export function compressChunkContent(content: string): string {
  return LZ_PREFIX + LZString.compressToBase64(content);
}

export function decompressChunkContent(content: string): string {
  if (content.startsWith(LZ_PREFIX)) {
    return LZString.decompressFromBase64(content.slice(LZ_PREFIX.length)) || content;
  }
  return content; // backward compatible: 기존 비압축 데이터
}

export interface ChunkToSave {
  content: string;
  embedding: number[];
  metadata: {
    fileName: string;
    fileUrl: string;
    chunkIndex: number;
    startChar: number;
    endChar: number;
  };
}

/**
 * 청크들을 exam_material_chunks 테이블에 저장
 * @param examId 시험 ID
 * @param chunks 저장할 청크 배열
 */
export async function saveChunksToDB(
  examId: string,
  chunks: ChunkToSave[]
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  try {
    // 배치로 삽입 (Supabase는 한 번에 최대 1000개까지 가능)
    const batchSize = 100;
    let totalSaved = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const records = batch.map((chunk) => {
        return {
          exam_id: examId,
          file_url: chunk.metadata.fileUrl,
          content: compressChunkContent(chunk.content),
          embedding: chunk.embedding, // Supabase가 자동으로 vector 타입으로 변환
          metadata: chunk.metadata,
        };
      });

      const { data, error } = await supabase
        .from("exam_material_chunks")
        .insert(records)
        .select("id, embedding");

      if (error) {
        throw error;
      }

      totalSaved += data?.length || batch.length;
    }
  } catch (error) {
    throw new Error(
      `청크 저장 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * 특정 파일의 기존 청크를 삭제 (파일 재처리 시 사용)
 * @param examId 시험 ID
 * @param fileUrl 파일 URL
 */
export async function deleteChunksByFileUrl(
  examId: string,
  fileUrl: string
): Promise<void> {
  const { error } = await supabase
    .from("exam_material_chunks")
    .delete()
    .eq("exam_id", examId)
    .eq("file_url", fileUrl);

  if (error) {
    throw new Error(
      `청크 삭제 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
