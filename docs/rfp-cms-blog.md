# RFP: Quest-On CMS / Blog Feature

> **작성일**: 2026-04-07
> **작성자**: Product
> **대상**: Engineering
> **우선순위**: High
> **예상 규모**: MVP 기준 1-2 sprints

---

## 1. 배경 & 목적

Quest-On은 현재 제품(AI 기반 시험/평가 플랫폼)은 있지만, 콘텐츠 마케팅 채널이 없다. SEO를 통한 오가닉 트래픽 확보와 교수/교육기관 관리자(our potential customers)를 대상으로 한 콘텐츠 퍼블리싱이 필요하다.

### 왜 지금?
- 경쟁사 대부분 콘텐츠가 약함 (ExamSoft 제외). "AI + 시험 + 튜터링" 콘텐츠는 아무도 점유하지 않은 블루오션
- Intercom 사례: 초기 창업자가 직접 쓴 블로그가 $1M→$50M ARR 핵심 성장 채널
- 콘텐츠는 compound returns — 일찍 시작할수록 유리

### 레퍼런스 기업
| 기업 | URL | 참고 포인트 |
|------|-----|------------|
| **Turnitin** | turnitin.com/blog | 교육자 pain point 타겟 블로그, 카테고리 분류 |
| **ExamSoft** | examsoft.com/resources | 가장 성숙한 모델. 블로그 + 케이스 스터디 + 백서 + 웨비나를 `/resources/`로 통합 |
| **Intercom** | intercom.com/blog | SaaS 블로그 성장의 교과서. 깔끔한 UI, 카테고리, CTA 배치 |
| **Buffer** | buffer.com/resources | `/resources/` 패턴, 심플한 구조 |
| **Vercel** | vercel.com/blog | Next.js + MDX 기반 블로그의 기술적 레퍼런스 |

---

## 2. 스코프 결정: Option A (서브디렉토리 블로그)

**우리는 현재 MVP 단계 제품이라, 무거운 별도 사이트 구축보다 기존 앱에 블로그를 추가하는 방향으로 진행한다.**

- **URL**: `quest-on.app/blog/`, `quest-on.app/blog/[slug]`
- **근거**: 서브디렉토리(`/blog/`)가 서브도메인(`blog.quest-on.app`)보다 SEO 효과가 40% 높다는 실증 데이터 존재 (Backlinko 11.8M 결과 분석, ButterCMS 케이스 스터디)
- **참고**: 향후 제품이 성장하면 별도 마케팅 사이트로 확장할 가능성은 열어둠. 지금은 가볍게 시작.

---

## 3. 요구사항

### 3.1 Must Have (MVP)

**블로그 퍼블리싱 시스템**
- 글 작성, 편집, 발행, 비공개(draft) 관리
- 마크다운 또는 리치 텍스트 에디터 (참고: 코드베이스에 Tiptap 에디터 이미 존재)
- 글 목록 페이지 (`/blog`) + 개별 글 페이지 (`/blog/[slug]`)
- 카테고리/태그 시스템 (필터링 가능)
- 반응형 디자인 (모바일 필수)

**SEO 기본**
- 글별 메타 타이틀, 메타 디스크립션, OG 이미지 설정
- 시맨틱 HTML (`<article>`, `<h1>`-`<h3>`, `<time>` 등)
- 자동 sitemap.xml 생성 (블로그 포스트 포함)
- 구조화된 데이터 (JSON-LD Article schema)
- 깔끔한 URL slug (`/blog/ai-powered-assessment-guide`)

**콘텐츠 타입 (최소 1종, 확장 고려한 구조)**
- Blog Post (MVP 필수)
- 구조적으로 나중에 Case Study, Guide, Announcement 등 추가 가능한 설계

**관리자 인터페이스**
- 글 CRUD (Create, Read, Update, Delete)
- Draft / Published 상태 관리
- 이미지 업로드 (기존 업로드 인프라 활용 가능)

### 3.2 Should Have (MVP+ / Fast Follow)

- 글 목록 페이지네이션 또는 무한 스크롤
- 관련 글 추천 (같은 태그/카테고리 기반)
- 소셜 공유 버튼 (Twitter, LinkedIn — 우리 타겟이 여기 있음)
- RSS 피드
- 읽기 시간 표시 (estimated reading time)
- 목차(TOC) 자동 생성

### 3.3 Nice to Have (후순위)

- 글 예약 발행 (scheduled publish)
- 조회수 / 인기글 트래킹 (Vercel Analytics 연동 또는 별도)
- 뉴스레터 구독 (이메일 캡처 CTA) — 추후 Resend, Mailchimp 등 연동
- 검색 기능
- 댓글 시스템 (Giscus 등)
- 다국어 지원 (한국어 / 영어)

---

## 4. 기술 방향 — 엔지니어 자유 영역

> **아래는 리서치 기반 제안이지, 지정이 아니다. 엔지니어가 우리 스택과 상황에 맞게 최적의 기술 선택을 해주길 바란다.**

### CMS 접근법 (택 1 — 엔지니어 판단)

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A. MDX 파일 기반** | `.mdx` 파일을 리포에 직접 관리 (Vercel 블로그 방식) | 비용 0, 빌드 타임 렌더링, 타입 안전 | 비개발자 편집 어려움 |
| **B. DB 기반 자체 CMS** | Prisma 모델 추가 + 관리 UI 직접 구축 | 우리 스택 일관성, 완전한 커스터마이징 | 개발 비용 높음 |
| **C. Headless CMS 연동** | Sanity, Contentful, Payload 등 외부 CMS | 에디터 UX 즉시 확보, 비개발자 친화 | 외부 의존성, 비용 발생 가능 |

**참고 사항:**
- 초기에는 글을 내(Product)가 직접 쓸 예정이라, 비개발자 UX가 지금 당장 critical하지는 않음
- 하지만 향후 외부 라이터 투입 가능성 있으므로 고려는 필요
- 코드베이스에 **Tiptap 에디터**가 이미 있음 — 재활용 가능성 검토 바람
- **어떤 방식이든 나중에 다른 방식으로 마이그레이션 가능한 구조**로 설계해주면 좋겠음

### 엔지니어에게 맡기는 판단들

아래 항목들은 **엔지니어가 자유롭게 결정**해주길 바란다:

- [ ] CMS 접근법 선택 (위 A/B/C 또는 다른 방식)
- [ ] 데이터 모델 / 스키마 설계
- [ ] 렌더링 전략 (SSG, ISR, SSR — SEO 최적화 관점에서 판단)
- [ ] 이미지 처리 방식 (Next.js Image optimization, 외부 CDN 등)
- [ ] 코드 구조 / 라우팅 설계
- [ ] 에디터 선택 (Tiptap 재활용 vs MDX vs 기타)
- [ ] 캐싱 전략
- [ ] Admin UI 구조 (기존 `/admin` 확장 vs 별도)

**단, 아래는 지켜주세요:**
- URL은 반드시 `quest-on.app/blog/[slug]` 패턴
- SEO 메타데이터는 글별로 커스터마이징 가능해야 함
- 기존 Quest-On 디자인 시스템 / 컴포넌트 재활용
- 글 상태(draft/published)는 반드시 구분

---

## 5. 콘텐츠 전략 컨텍스트 (엔지니어 참고용)

엔지니어가 설계 시 어떤 콘텐츠가 올라올지 감을 잡을 수 있도록:

### 타겟 독자
- **Primary**: 대학교 교수, 강사 (우리 제품을 쓸 사람)
- **Secondary**: 교육기관 IT 관리자, 학과장, 교무처 (구매 결정권자)

### 계획 중인 콘텐츠 유형
| 타입 | 설명 | 예시 |
|------|------|------|
| **Blog Post** | 교육 트렌드, AI 활용법, 교수법 인사이트 | "AI 시대의 대학 시험, 어떻게 바뀌어야 하나" |
| **Case Study** | 실제 사용 대학/교수 성공 사례 | "○○대학교, Quest-On 도입 후 채점 시간 60% 감소" |
| **Guide** | 실용적 가이드, How-to | "온라인 시험 설계 가이드: 부정행위 방지부터 AI 튜터링까지" |
| **Announcement** | 제품 업데이트, 새 기능 소개 | "Quest-On 2.0: 마인드맵 시험 지원 시작" |

### 발행 빈도 (초기)
- 주 2-3회 목표 (Intercom 초기 전략 참고)
- 초기에는 내가 직접 작성 (도메인 전문성 필요)

---

## 6. 디자인 가이드

### 필수
- 기존 Quest-On UI와 일관된 느낌 (같은 사이트라는 인식)
- PublicHeader 또는 기존 네비게이션에 "Blog" 탭/링크 추가
- 모바일 퍼스트 반응형

### 레퍼런스 (분위기 참고)
- **Intercom Blog** (intercom.com/blog) — 깔끔, 카테고리 명확, CTA 자연스러움
- **Vercel Blog** (vercel.com/blog) — 미니멀, 기술 블로그 레퍼런스
- **Linear Blog** (linear.app/blog) — 모던 SaaS 블로그의 정석

### 엔지니어 자유
- 구체적 레이아웃, 카드 디자인, 타이포그래피 등은 자유롭게
- 위 레퍼런스는 "이런 느낌" 정도의 참고

---

## 7. 성공 기준 (Definition of Done)

MVP가 완성되었다고 판단하는 기준:

- [ ] `/blog` 페이지에서 발행된 글 목록 표시
- [ ] `/blog/[slug]` 페이지에서 개별 글 표시 (SEO 메타데이터 포함)
- [ ] 관리자가 글을 작성/편집/발행/비공개 처리 가능
- [ ] 기존 Quest-On 네비게이션에서 Blog 접근 가능
- [ ] 모바일에서 정상 작동
- [ ] Lighthouse SEO 점수 90+
- [ ] sitemap.xml에 블로그 URL 포함
- [ ] 최소 1개 샘플 글로 전체 플로우 검증 완료

---

## 8. 타임라인 제안

> 엔지니어가 스코프 보고 조정 가능. 아래는 희망 사항.

| 단계 | 기간 | 산출물 |
|------|------|--------|
| 기술 선택 & 설계 | 2-3일 | 기술 결정 문서 (간단히) |
| MVP 구현 | 1-1.5주 | 블로그 CRUD + 공개 페이지 + SEO |
| QA & 샘플 콘텐츠 | 2-3일 | 테스트 완료 + 샘플 글 1-2개 |
| **총** | **~2주** | 발행 가능한 블로그 |

---

## 9. 질문 & 논의 사항

엔지니어가 시작 전 확인/논의가 필요한 항목:

1. CMS 접근법에 대한 의견 — 선호하는 방식이 있는지?
2. 기존 admin 패널 확장 vs 별도 블로그 관리 페이지?
3. 이미지 호스팅 — 기존 Supabase Storage 활용? 별도?
4. 인증 — 블로그 관리는 기존 instructor/admin 권한 활용?
5. 예상되는 기술적 리스크나 concern?

---

## 부록: 리서치 데이터

### A. 경쟁사 콘텐츠 현황

| 플랫폼 | 콘텐츠 성숙도 | 접근 방식 |
|---------|-------------|----------|
| ExamSoft | ★★★★★ | 풀스택 리소스 허브 (블로그+케이스+백서+웨비나), 버티컬별 분류 |
| Turnitin | ★★★★☆ | SEO 최적화 블로그, AI 관련 키워드 점유 |
| Gradescope | ★★☆☆☆ | Medium 블로그 (SEO 약함) |
| Proctorio | ★★☆☆☆ | 통합 문서 중심, 블로그 미약 |
| Respondus | ★☆☆☆☆ | 거의 없음 |

### B. SaaS 콘텐츠 마케팅 벤치마크

| 기업 | 핵심 전략 | 결과 |
|------|----------|------|
| Intercom | 창업자 직접 작성, 주 5-6회, 에버그린 콘텐츠 | $1M→$50M ARR 핵심 채널 |
| HubSpot | 카테고리 소유 ("inbound marketing"), 무료 도구/템플릿 | 월 450만 블로그 방문자 |
| Buffer | 게스트 포스팅 + 투명성 콘텐츠 | 9개월 만에 10만 유저 |
| Notion | 커뮤니티 + 템플릿 기반 콘텐츠 루프 | 유저 생성 콘텐츠가 SEO 자산화 |

### C. 기술 스택 레퍼런스

| 접근법 | 사용 기업 | Next.js 궁합 |
|--------|----------|-------------|
| MDX 파일 | Vercel, Tailwind CSS, HashiCorp | ★★★★★ |
| Sanity | 다수 Next.js SaaS | ★★★★★ |
| Contentful | Intercom (마케팅 사이트) | ★★★★☆ |
| Payload CMS | Next.js 네이티브 | ★★★★☆ |
| WordPress (headless) | ExamSoft 등 레거시 | ★★★☆☆ |
