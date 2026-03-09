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

/**
 * 여러 텍스트를 배치로 임베딩 변환
 * @param texts 임베딩할 텍스트 배열
 * @returns 임베딩 벡터 배열
 */
export async function createEmbeddings(
  texts: string[],
  tracking?: EmbeddingTrackingContext
): Promise<number[][]> {
  try {
    const inputs = texts.map((t) => t.trim());
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

    if (!response.data || response.data.length !== texts.length) {
      throw new Error(
        `임베딩 생성 실패: 요청한 ${texts.length}개 중 ${
          response.data?.length || 0
        }개만 생성됨`
      );
    }

    return response.data.map((item) => item.embedding);
  } catch (error) {
    throw new Error(
      `배치 임베딩 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
