/**
 * Shared RAG processing module: chunk → embed → save for a single material file.
 */

import { chunkText, formatChunkMetadata } from "@/lib/chunking";
import { createEmbeddings } from "@/lib/embedding";
import { saveChunksToDB, deleteChunksByFileUrl } from "@/lib/save-chunks";
import { logError } from "@/lib/logger";

const MAX_CHUNKS_PER_FILE = 10_000;

export interface MaterialData {
  url: string;
  text: string;
  fileName: string;
}

export interface RAGTrackingContext {
  route: string;
  userId: string;
  source: string;
}

/** Process a single material file: chunk → delete old → embed → save. Returns chunks saved count. */
export async function processMaterialRAG(
  examId: string,
  materialData: MaterialData,
  idx: number,
  tracking: RAGTrackingContext
): Promise<number> {
  try {
    if (!materialData.text || materialData.text.trim().length === 0) {
      return 0;
    }

    let chunks = chunkText(materialData.text, {
      chunkSize: 800,
      chunkOverlap: 200,
    });

    if (chunks.length === 0) {
      return 0;
    }

    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      console.warn(
        `[processMaterialRAG] File "${materialData.fileName}" produced ${chunks.length} chunks, truncating to ${MAX_CHUNKS_PER_FILE}`
      );
      chunks = chunks.slice(0, MAX_CHUNKS_PER_FILE);
    }

    await deleteChunksByFileUrl(examId, materialData.url);

    const formattedChunks = chunks.map((chunk) =>
      formatChunkMetadata(chunk, materialData.fileName, materialData.url)
    );

    const chunkTexts = formattedChunks.map((c) => c.content);
    const embeddings = await createEmbeddings(chunkTexts, {
      route: tracking.route,
      userId: tracking.userId,
      examId,
      metadata: {
        source: tracking.source,
        material_index: idx,
      },
    });

    const chunksToSave = formattedChunks.map((chunk, index) => ({
      content: chunk.content,
      embedding: embeddings[index],
      metadata: chunk.metadata,
    }));

    await saveChunksToDB(examId, chunksToSave);
    return chunksToSave.length;
  } catch (error) {
    logError(`[processMaterialRAG] Failed for material ${idx}`, error, {
      path: tracking.route,
      user_id: tracking.userId,
      additionalData: { examId, fileName: materialData.fileName },
    });
    return 0;
  }
}
