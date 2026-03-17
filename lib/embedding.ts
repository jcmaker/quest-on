/**
 * 임베딩 관련 유틸리티 함수
 */

import { getOpenAI } from "./openai";
import {
  buildAiTextMetadata,
  callTrackedEmbedding,
} from "@/lib/ai-tracking";

// OpenAI Embedding 모델 상수
export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536차원
export const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingTrackingContext {
  route?: string;
  userId?: string;
  examId?: string;
  sessionId?: string;
  qIdx?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 텍스트를 임베딩 벡터로 변환
 * @param text 임베딩할 텍스트
 * @returns 임베딩 벡터 (1536차원 배열)
 */
export async function createEmbedding(
  text: string,
  tracking?: EmbeddingTrackingContext
): Promise<number[]> {
  try {
    const input = text.trim();
    const { data: response } = await callTrackedEmbedding(
      () =>
        getOpenAI().embeddings.create({
          model: EMBEDDING_MODEL,
          input,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      {
        feature: "embedding",
        route: tracking?.route ?? "lib/embedding",
        model: EMBEDDING_MODEL,
        userId: tracking?.userId,
        examId: tracking?.examId,
        sessionId: tracking?.sessionId,
        qIdx: tracking?.qIdx,
        metadata: buildAiTextMetadata({
          inputText: input,
          extra: tracking?.metadata,
        }),
      }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error("임베딩 생성 실패: 응답 데이터가 없습니다.");
    }

    return response.data[0].embedding;
  } catch (error) {
    throw new Error(
      `임베딩 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

const EMBEDDING_BATCH_SIZE = 2000;

/** Single-batch embedding call (≤ 2,000 inputs). */
async function singleBatchEmbed(
  inputs: string[],
  tracking?: EmbeddingTrackingContext
): Promise<number[][]> {
  const { data: response } = await callTrackedEmbedding(
    () =>
      getOpenAI().embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    {
      feature: "embedding",
      route: tracking?.route ?? "lib/embedding",
      model: EMBEDDING_MODEL,
      userId: tracking?.userId,
      examId: tracking?.examId,
      sessionId: tracking?.sessionId,
      qIdx: tracking?.qIdx,
      metadata: buildAiTextMetadata({
        inputText: inputs,
        extra: {
          batch_size: inputs.length,
          ...(tracking?.metadata ?? {}),
        },
      }),
    }
  );

  if (!response.data || response.data.length !== inputs.length) {
    throw new Error(
      `임베딩 생성 실패: 요청한 ${inputs.length}개 중 ${
        response.data?.length || 0
      }개만 생성됨`
    );
  }

  return response.data.map((item) => item.embedding);
}

/**
 * 여러 텍스트를 배치로 임베딩 변환
 * 2,000개 초과 시 자동으로 배치 분할하여 순차 처리
 * @param texts 임베딩할 텍스트 배열
 * @returns 임베딩 벡터 배열
 */
export async function createEmbeddings(
  texts: string[],
  tracking?: EmbeddingTrackingContext
): Promise<number[][]> {
  try {
    const inputs = texts.map((t) => t.trim());

    if (inputs.length <= EMBEDDING_BATCH_SIZE) {
      return singleBatchEmbed(inputs, tracking);
    }

    // Split into batches and process sequentially to avoid rate limits
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
      const batchEmbeddings = await singleBatchEmbed(batch, tracking);
      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  } catch (error) {
    throw new Error(
      `배치 임베딩 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
