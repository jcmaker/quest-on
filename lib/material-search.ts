/**
 * 수업 자료에서 관련 내용을 검색하는 유틸리티 함수
 * 효율적인 키워드 기반 검색을 사용하여 학생 질문과 관련된 수업 내용을 찾습니다.
 */

interface MaterialText {
  url: string;
  text: string;
  fileName: string;
}

interface SearchResult {
  text: string;
  fileName: string;
  relevanceScore: number;
}

/**
 * 텍스트를 청크로 나누기 (효율적인 검색을 위해)
 * @param text 원본 텍스트
 * @param chunkSize 청크 크기 (문자 수)
 * @param overlap 겹치는 부분 (문자 수)
 */
function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 100
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }

  return chunks;
}

/**
 * 질문에서 키워드 추출 (간단한 방법)
 * @param question 학생 질문
 */
function extractKeywords(question: string): string[] {
  // 한국어 조사, 어미, 불필요한 단어 제거 (최소한만)
  const stopWords = [
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "에서",
    "로",
    "으로",
    "와",
    "과",
    "도",
    "만",
    "부터",
    "까지",
    "에게",
    "한테",
    "께",
    "이다",
    "입니다",
    "있습니다",
    "합니다",
    "됩니다",
    "어떻게",
    "무엇",
    "왜",
    "언제",
    "어디",
    "누구",
    "그",
    "이",
    "저",
    "그것",
    "이것",
    "저것",
  ];

  // 특수문자 제거 (한글, 영문, 숫자, 공백만 유지)
  const cleaned = question
    .replace(/[^\w\s가-힣]/g, " ") // 특수문자 제거
    .split(/\s+/) // 공백으로 분리
    .map((word) => word.trim()) // 앞뒤 공백 제거
    .filter(
      (word) =>
        word.length > 1 && // 최소 2자 이상
        !stopWords.includes(word) && // 불용어 제거
        !/^\d+$/.test(word) // 숫자만 있는 단어 제거
    );

  // 중복 제거
  const uniqueKeywords = Array.from(new Set(cleaned));

  // 최소 1개 이상의 키워드가 있어야 함
  return uniqueKeywords.length > 0 ? uniqueKeywords : [question.trim()]; // 키워드가 없으면 원본 질문 사용
}

/**
 * 텍스트 청크의 관련도 점수 계산
 * @param chunk 텍스트 청크
 * @param keywords 키워드 배열
 */
function calculateRelevanceScore(chunk: string, keywords: string[]): number {
  const lowerChunk = chunk.toLowerCase();
  let score = 0;

  // 키워드 매칭 점수
  keywords.forEach((keyword) => {
    const matches = (lowerChunk.match(new RegExp(keyword, "g")) || []).length;
    score += matches * 2; // 키워드가 많이 나올수록 높은 점수
  });

  // 키워드 밀도 (키워드 수 / 전체 단어 수)
  const words = chunk.split(/\s+/).length;
  if (words > 0) {
    const keywordCount = keywords.filter((kw) =>
      lowerChunk.includes(kw)
    ).length;
    score += (keywordCount / words) * 100;
  }

  return score;
}

/**
 * 수업 자료에서 학생 질문과 관련된 내용 검색
 * @param materialsText 수업 자료 텍스트 배열
 * @param question 학생 질문
 * @param maxResults 최대 결과 수
 * @param maxLength 최대 텍스트 길이 (토큰 제한 고려)
 */
export function searchRelevantMaterials(
  materialsText: MaterialText[],
  question: string,
  maxResults: number = 3,
  maxLength: number = 2000
): string {
  if (!materialsText || materialsText.length === 0) {
    console.log("[material-search] materialsText가 비어있음");
    return "";
  }

  const keywords = extractKeywords(question);
  console.log("[material-search] 추출된 키워드:", {
    question: question.substring(0, 100),
    keywords,
    keywordsCount: keywords.length,
  });

  if (keywords.length === 0) {
    console.log("[material-search] 키워드 추출 실패 - 빈 결과 반환");
    return "";
  }

  const results: SearchResult[] = [];

  // 각 자료에서 관련 내용 검색
  materialsText.forEach((material) => {
    if (!material.text || material.text.trim().length === 0) {
      return;
    }

    // 텍스트를 청크로 나누기
    const chunks = chunkText(material.text, 500, 100);

    chunks.forEach((chunk) => {
      const score = calculateRelevanceScore(chunk, keywords);
      if (score > 0) {
        results.push({
          text: chunk.trim(),
          fileName: material.fileName || "수업 자료",
          relevanceScore: score,
        });
      }
    });
  });

  // 관련도 점수로 정렬
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log("[material-search] 검색 결과:", {
    totalResults: results.length,
    topScores: results.slice(0, 5).map((r) => ({
      score: r.relevanceScore,
      textPreview: r.text.substring(0, 50),
      fileName: r.fileName,
    })),
  });

  // 상위 결과만 선택하고 텍스트 길이 제한
  const selectedResults = results.slice(0, maxResults);
  let totalLength = 0;
  const finalTexts: string[] = [];

  for (const result of selectedResults) {
    if (totalLength + result.text.length > maxLength) {
      // 남은 공간만큼만 추가
      const remaining = maxLength - totalLength;
      if (remaining > 100) {
        // 최소 100자 이상은 남겨야 의미있음
        finalTexts.push(
          `${result.text.substring(0, remaining)}... [${result.fileName}]`
        );
      }
      break;
    }
    finalTexts.push(`${result.text} [${result.fileName}]`);
    totalLength += result.text.length;
  }

  if (finalTexts.length === 0) {
    console.log("[material-search] 최종 결과 없음");
    return "";
  }

  const result = `\n\n[수업 자료 참고 내용]\n${finalTexts.join("\n\n---\n\n")}`;
  console.log("[material-search] 최종 결과:", {
    resultCount: finalTexts.length,
    totalLength: result.length,
    preview: result.substring(0, 200),
  });

  return result;
}

/**
 * 수업 자료 텍스트를 DB에 저장하기 위한 형식으로 변환
 * @param materials 파일 URL 배열
 * @param extractedTexts 추출된 텍스트 맵 (url -> text)
 */
export function formatMaterialsText(
  materials: string[],
  extractedTexts: Map<string, { text: string; fileName: string }>
): MaterialText[] {
  return materials
    .map((url) => {
      const extracted = extractedTexts.get(url);
      if (!extracted || !extracted.text) {
        return null;
      }
      return {
        url,
        text: extracted.text,
        fileName: extracted.fileName || url.split("/").pop() || "unknown",
      };
    })
    .filter((item): item is MaterialText => item !== null);
}
