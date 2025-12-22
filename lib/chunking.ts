/**
 * 텍스트 청킹(Chunking) 유틸리티
 * 긴 문서를 AI가 처리하기 좋은 크기로 분할
 */

export interface Chunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

export interface ChunkingOptions {
  chunkSize?: number; // 청크 크기 (문자 수)
  chunkOverlap?: number; // 청크 간 겹치는 문자 수
  separator?: string; // 구분자 (기본: "\n\n")
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  chunkSize: 800, // 약 500-1000자 권장
  chunkOverlap: 200, // 겹치는 부분으로 문맥 유지
  separator: "\n\n",
};

/**
 * 텍스트를 청크로 분할
 * @param text 원본 텍스트
 * @param options 청킹 옵션
 * @returns 청크 배열
 */
export function chunkText(
  text: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];

  // 텍스트가 청크 크기보다 작으면 그대로 반환
  if (text.length <= opts.chunkSize) {
    return [
      {
        text,
        index: 0,
        startChar: 0,
        endChar: text.length,
      },
    ];
  }

  // 구분자로 먼저 분할 시도
  const sections = text.split(opts.separator);
  let currentChunk = "";
  let currentStart = 0;
  let chunkIndex = 0;

  for (const section of sections) {
    // 현재 청크에 섹션을 추가했을 때 크기 확인
    const potentialChunk =
      currentChunk + (currentChunk ? opts.separator : "") + section;

    if (potentialChunk.length <= opts.chunkSize) {
      // 청크 크기 내에 있으면 추가
      currentChunk = potentialChunk;
    } else {
      // 청크 크기를 초과하면 현재 청크 저장하고 새로 시작
      if (currentChunk) {
        chunks.push({
          text: currentChunk,
          index: chunkIndex++,
          startChar: currentStart,
          endChar: currentStart + currentChunk.length,
        });

        // Overlap 처리: 이전 청크의 마지막 부분을 포함
        const overlapText = currentChunk.slice(-opts.chunkOverlap);
        currentStart = currentStart + currentChunk.length - opts.chunkOverlap;
        currentChunk = overlapText + opts.separator + section;
      } else {
        // 현재 청크가 비어있고 섹션이 너무 크면 강제로 분할
        if (section.length > opts.chunkSize) {
          // 섹션을 강제로 분할
          let sectionStart = 0;
          while (sectionStart < section.length) {
            const chunkText = section.slice(
              sectionStart,
              sectionStart + opts.chunkSize
            );
            chunks.push({
              text: chunkText,
              index: chunkIndex++,
              startChar: currentStart + sectionStart,
              endChar: currentStart + sectionStart + chunkText.length,
            });
            sectionStart += opts.chunkSize - opts.chunkOverlap;
          }
          currentChunk = "";
          currentStart += section.length;
        } else {
          currentChunk = section;
        }
      }
    }
  }

  // 마지막 청크 추가
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      index: chunkIndex,
      startChar: currentStart,
      endChar: currentStart + currentChunk.length,
    });
  }

  return chunks;
}

/**
 * 청크를 메타데이터와 함께 포맷팅
 */
export function formatChunkMetadata(
  chunk: Chunk,
  fileName: string,
  fileUrl: string
): {
  content: string;
  metadata: {
    fileName: string;
    fileUrl: string;
    chunkIndex: number;
    startChar: number;
    endChar: number;
  };
} {
  return {
    content: chunk.text,
    metadata: {
      fileName,
      fileUrl,
      chunkIndex: chunk.index,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
    },
  };
}
