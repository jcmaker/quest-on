/**
 * 청크를 DB에 저장하는 유틸리티
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    console.log("⚠️ [save-chunks] 저장할 청크가 없습니다.");
    return;
  }

  console.log("💾 [save-chunks] 청크 저장 시작:", {
    examId,
    chunksCount: chunks.length,
    fileUrl: chunks[0]?.metadata?.fileUrl || "unknown",
    fileName: chunks[0]?.metadata?.fileName || "unknown",
  });

  try {
    // 배치로 삽입 (Supabase는 한 번에 최대 1000개까지 가능)
    const batchSize = 100;
    let totalSaved = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      console.log(`📦 [save-chunks] 배치 ${batchNum} 처리 중:`, {
        batchSize: batch.length,
        startIndex: i,
        endIndex: i + batch.length - 1,
      });

      const records = batch.map((chunk, idx) => {
        const record = {
          exam_id: examId,
          file_url: chunk.metadata.fileUrl,
          content: chunk.content.substring(0, 100) + "...", // 로그용 미리보기
          contentLength: chunk.content.length,
          embeddingLength: chunk.embedding.length,
          metadata: chunk.metadata,
        };

        if (idx === 0) {
          console.log(
            `📄 [save-chunks] 배치 ${batchNum} 첫 번째 레코드 샘플:`,
            {
              fileUrl: record.file_url,
              contentPreview: record.content,
              embeddingDimensions: record.embeddingLength,
              chunkIndex: record.metadata.chunkIndex,
            }
          );
        }

        return {
          exam_id: examId,
          file_url: chunk.metadata.fileUrl,
          content: chunk.content,
          embedding: chunk.embedding, // Supabase가 자동으로 vector 타입으로 변환
          metadata: chunk.metadata,
        };
      });

      const { data, error } = await supabase
        .from("exam_material_chunks")
        .insert(records)
        .select("id, embedding");

      // 벡터 저장 확인
      if (data && data.length > 0) {
        const hasEmbedding = data.some((item: any) => item.embedding !== null);
        console.log(`🔍 [save-chunks] 배치 ${batchNum} 벡터 저장 확인:`, {
          savedRecords: data.length,
          hasEmbedding,
          sampleEmbedding: data[0]?.embedding ? "벡터 저장됨" : "벡터 없음",
        });

        if (!hasEmbedding) {
          console.error(
            `⚠️ [save-chunks] 경고: 배치 ${batchNum}의 벡터가 저장되지 않았습니다!`
          );
        }
      }

      if (error) {
        console.error(`❌ [save-chunks] 배치 ${batchNum} 저장 실패:`, {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      totalSaved += data?.length || batch.length;
      console.log(`✅ [save-chunks] 배치 ${batchNum} 저장 완료:`, {
        savedCount: data?.length || batch.length,
        totalSaved,
        remaining: chunks.length - totalSaved,
      });
    }

    console.log("🎉 [save-chunks] 모든 청크 저장 완료:", {
      examId,
      totalChunks: chunks.length,
      totalSaved,
      fileUrl: chunks[0]?.metadata?.fileUrl || "unknown",
    });
  } catch (error) {
    console.error("❌ [save-chunks] 청크 저장 실패:", {
      examId,
      chunksCount: chunks.length,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
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
  console.log(
    `[save-chunks] 파일의 기존 청크 삭제 시작 (examId: ${examId}, fileUrl: ${fileUrl})`
  );

  const { error } = await supabase
    .from("exam_material_chunks")
    .delete()
    .eq("exam_id", examId)
    .eq("file_url", fileUrl);

  if (error) {
    console.error("[save-chunks] 청크 삭제 실패:", error);
    throw new Error(
      `청크 삭제 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  console.log("[save-chunks] 기존 청크 삭제 완료");
}
