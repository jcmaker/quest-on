// 서울 지역 대학교 데이터 타입 정의 및 유틸리티 함수

export interface SeoulUniversity {
  main_key: string;
  name_kor: string; // 학교명
  type: string; // 설립 (국립, 사립, 공립 등)
  cate1_name: string; // 학교종류 (일반대학, 전문대학 등)
  branch: string; // 본분교
  h_kor_city: string; // 행정시
  h_kor_gu: string; // 행정구
  h_kor_dong: string; // 행정동
  add_kor: string; // 주소
  add_kor_road: string | null; // 도로명주소
  tel: string | null; // 전화번호
  fax: string | null; // 팩스번호
  hp: string | null; // 홈페이지
  state: string; // 학교상태 (기존, 폐교 등)
  year: string; // 연도
  postcode: string | null; // 우편번호
}

// 검색 결과를 위한 간소화된 타입
export interface UniversitySearchResult {
  name: string;
  type: string;
  category: string;
  branch: string;
  address: string;
  fullName: string; // 표시용 전체 이름 (본교/분교 포함)
}

// JSON 데이터를 로드하고 검색 가능한 형태로 변환
let universitiesCache: UniversitySearchResult[] | null = null;

export async function loadUniversities(): Promise<UniversitySearchResult[]> {
  if (universitiesCache) {
    return universitiesCache;
  }

  try {
    // JSON 파일을 직접 import (resolveJsonModule이 true이므로 가능)
    const data = await import("@/seoul-uni.json");
    // JSON 파일의 타입 정의
    interface SeoulUniJson {
      DESCRIPTION: Record<string, string>;
      DATA: SeoulUniversity[];
    }
    const jsonData = data as unknown as SeoulUniJson;
    const universities: SeoulUniversity[] = jsonData.DATA;

    universitiesCache = universities
      .filter((uni) => uni.state === "기존") // 기존 학교만 필터링
      .map((uni) => ({
        name: uni.name_kor,
        type: uni.type,
        category: uni.cate1_name,
        branch: uni.branch,
        address: uni.add_kor || "",
        fullName:
          uni.branch === "본교"
            ? uni.name_kor
            : `${uni.name_kor} ${uni.branch}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return universitiesCache;
  } catch (error) {
    console.error("Failed to load universities:", error);
    return [];
  }
}

// 한글 초성 추출 함수
function getInitials(text: string): string {
  const initialConsonants = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];

  return text
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
      if (code >= 0xac00 && code <= 0xd7a3) {
        const initialIndex = Math.floor((code - 0xac00) / 588);
        return initialConsonants[initialIndex];
      }
      return char;
    })
    .join("");
}

// 학교명으로 검색 (초성 검색 지원)
export async function searchUniversities(
  query: string,
  limit: number = 10
): Promise<UniversitySearchResult[]> {
  const universities = await loadUniversities();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return universities.slice(0, limit);
  }

  const lowerQuery = trimmedQuery.toLowerCase();
  const queryInitials = getInitials(trimmedQuery);

  return universities
    .filter((uni) => {
      const searchableText = `${uni.name} ${uni.fullName} ${uni.address}`;
      const lowerSearchableText = searchableText.toLowerCase();
      const searchableInitials = getInitials(searchableText);

      // 1. 일반 텍스트 검색 (대소문자 무시) - 우선순위 1
      if (lowerSearchableText.includes(lowerQuery)) {
        return true;
      }

      // 2. 초성만 입력한 경우 (예: 'ㅅ', 'ㅅㅇ')
      if (/^[ㄱ-ㅎ]+$/.test(trimmedQuery)) {
        // 초성으로 시작하는 학교 찾기
        return searchableInitials.startsWith(queryInitials);
      }

      // 3. 한글 한 글자 입력 시 (예: '스', '서')
      // 해당 글자의 초성으로 시작하는 학교 찾기
      if (trimmedQuery.length === 1 && /[가-힣]/.test(trimmedQuery)) {
        const firstCharInitial = queryInitials[0];
        if (firstCharInitial && /[ㄱ-ㅎ]/.test(firstCharInitial)) {
          return searchableInitials.startsWith(firstCharInitial);
        }
      }

      // 4. 여러 글자 입력 시 초성으로 시작하는지 확인
      if (queryInitials && queryInitials.length > 0) {
        const firstCharInitial = queryInitials[0];
        if (firstCharInitial && /[ㄱ-ㅎ]/.test(firstCharInitial)) {
          // 첫 글자 초성으로 시작하는 학교 찾기
          return searchableInitials.startsWith(firstCharInitial);
        }
      }

      return false;
    })
    .slice(0, limit);
}

// 학교명으로 정확히 찾기
export async function findUniversityByName(
  name: string
): Promise<UniversitySearchResult | null> {
  const universities = await loadUniversities();
  return (
    universities.find((uni) => uni.name === name || uni.fullName === name) ||
    null
  );
}
