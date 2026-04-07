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
| **Turnitin** | turnitin.com/blog | 교육자 pain point 타겟 블로그, 카테고리 분류. "does turnitin detect AI writing" 같은 SEO 키워드 점유 |
| **Instructure (Canvas)** | instructure.com/resources/blog | 3축 필터링 (제품별/기관타입별/주제별) — 44+ 페이지 콘텐츠. 가장 체계적인 EdTech 블로그 |
| **ExamSoft** | examsoft.com/resources | 가장 성숙한 모델. 블로그 + 케이스 스터디 + 백서 + 웨비나를 `/resources/`로 통합. 버티컬별 분류 (법학, 의학, 간호 등) |
| **Honorlock** | honorlock.com/blog | 경쟁사 비교 콘텐츠 적극 활용 ("ChatGPT vs. Honorlock"). 블로그 + eBook + 웨비나 + 고객사례 |
| **Intercom** | intercom.com/blog | SaaS 블로그 성장의 교과서. 창업자가 첫 100개 중 93개 직접 작성. $1M→$50M ARR 핵심 채널 |
| **Vercel** | vercel.com/blog | Next.js + MDX 기반 블로그의 기술적 레퍼런스 |
| **Linear** | linear.app/blog | 모던 SaaS 블로그 디자인의 정석 |

---

## 2. 스코프 결정: Option A (서브디렉토리 블로그)

**우리는 현재 MVP 단계 제품이라, 무거운 별도 사이트 구축보다 기존 앱에 블로그를 추가하는 방향으로 진행한다.**

- **URL**: `quest-on.app/blog/`, `quest-on.app/blog/[slug]`
- **근거**: 서브디렉토리(`/blog/`)가 서브도메인(`blog.quest-on.app`)보다 SEO 효과가 40% 높다는 실증 데이터 존재. 반대로 서브도메인으로 이전한 기업은 47% 트래픽 하락 사례도 있음 (Backlinko 11.8M 결과 분석, ButterCMS/iWantMyName 케이스 스터디)
- **업계 현황**: Turnitin, Instructure, Honorlock, Kahoot 모두 서브디렉토리 사용. Coursera만 서브도메인 (레거시)
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
| ExamSoft (Turnitin 자회사) | ★★★★★ | 풀스택 리소스 허브 (블로그+케이스+백서+웨비나), 버티컬별 분류 (법학, 의학, 간호 등) |
| Turnitin | ★★★★☆ | SEO 최적화 블로그, AI writing detection 키워드 점유 |
| Instructure (Canvas) | ★★★★☆ | 3축 필터링 블로그, 44+ 페이지 콘텐츠 |
| Honorlock | ★★★☆☆ | 블로그 + 리소스 허브. 경쟁사 비교 콘텐츠 활용 |
| Gradescope | ★★☆☆☆ | Medium 블로그 (SEO 약함 — 도메인 권위가 Medium으로 감) |
| Proctorio | ★★☆☆☆ | 통합 문서 중심, 블로그 미약 |
| Respondus | ★☆☆☆☆ | 거의 없음. LMS 파트너십에 의존 |

### B. 콘텐츠 갭 분석 — Quest-On의 기회

리서치 결과 아래 영역은 **경쟁사 누구도 점유하지 않은 콘텐츠 블루오션**:

1. **"시험 중 AI 튜터링" 콘텐츠** — Quest-On의 고유 앵글. 경쟁사는 AI 감독/채점만 다룸
2. **교수 워크플로우 콘텐츠** — "AI로 시험 문제 더 잘 만드는 법", "채점 시간 80% 줄이기" 등 개별 교수 타겟
3. **비교/대안 콘텐츠** — "Gradescope 대안", "ExamSoft vs ○○" — high-intent 키워드
4. **학과별 콘텐츠** — "컴퓨터공학 AI 평가 도구", "간호학과 온라인 시험" — long-tail SEO
5. **평가 교수법 콘텐츠** — "AI 시대의 형성평가 vs 총괄평가" — 사고 리더십 포지셔닝

### C. SaaS 콘텐츠 마케팅 벤치마크

| 기업 | 핵심 전략 | 결과 |
|------|----------|------|
| Intercom | 창업자 직접 작성, 주 5-6회, 에버그린 콘텐츠, 뉴스 사이클 의도적 회피 | $1M→$50M ARR 핵심 채널. 월 20만 블로그 PV, 4만 팟캐스트 청취자, 30만 ebook 다운로드 |
| HubSpot | 카테고리 소유 ("inbound marketing"), 무료 도구/템플릿, 토픽 클러스터 모델 | 월 450만 블로그 방문자. 매출 귀속: 33% 입소문, 26% SEO, 13% 블로그 |
| Buffer | 게스트 포스팅 (45+ 외부 필진) + 투명성 콘텐츠 (연봉/매출 공개) | 9개월 만에 10만 유저, 월 150만 방문 |
| Notion | 커뮤니티 + 템플릿 기반 콘텐츠 루프. 유저 생성 템플릿이 SEO 자산화 | 오가닉 90%+, 월 $14.71M 트래픽 가치 |
| SNHU | 비브랜드 검색 타겟 교육 콘텐츠 | 월 130만 오가닉 방문, 77% 비브랜드 검색 |

### D. Higher Ed 세일즈 사이클 참고

- Higher Ed 구매 사이클: **9-18개월** (위원회 검토 포함)
- 관여 이해관계자: 교수(최종 사용자), 학과장, IT 관리자, 교무처, 구매팀
- B2B 연구자 71%가 **비브랜드 일반 검색**으로 시작 → SEO 콘텐츠가 첫 접점
- 콘텐츠는 장기 너처링 역할 — 단기 전환보다 신뢰 구축이 목적

### E. 기술 스택 레퍼런스

| 접근법 | 사용 기업 | Next.js 궁합 | 비고 |
|--------|----------|-------------|------|
| MDX 파일 | Vercel, Tailwind CSS, HashiCorp | ★★★★★ | 비용 0, 개발자 친화. Contentlayer는 유지보수 중단됨 — `next-mdx-remote` 또는 `mdx-bundler` 사용 |
| Sanity | Figma, Morning Brew, PUMA | ★★★★★ | Vercel 공식 Blog Starter Kit 존재. 무료 티어 넉넉함 |
| Contentful | Intercom (마케팅 사이트) | ★★★★☆ | 엔터프라이즈급. 초기 스타트업에는 오버스펙 |
| Payload CMS | Next.js 네이티브 앱들 | ★★★★☆ | 오픈소스, Next.js 안에서 돌아감. 2025-2026 주목주 |
| WordPress (headless) | ExamSoft 등 레거시 | ★★★☆☆ | 운영 오버헤드 높음 (호스팅, 보안 패치, 플러그인) |

### F. 리서치 출처

- [ButterCMS: Subdomain vs Subdirectory — One Is 40% Better](https://buttercms.com/blog/blog-subdomain-or-subdirectory-hint-one-is-40-better/)
- [Semrush: Subdomain vs Subdirectory](https://www.semrush.com/blog/subdomain-vs-subdirectory/)
- [The Intercom Effect: $1-50M ARR Case Study](https://www.256content.com/blog/intercom-content-case-study)
- [How Intercom Grew](https://www.howtheygrow.co/p/how-intercom-grows)
- [HubSpot Content Strategy Drives 1.8M Organic Traffic](https://concurate.com/hubspot-content-strategy/)
- [How Notion Captures $14.71M in Traffic Value](https://inpages.ai/insight/marketing-strategy/notion.com)
- [SEO for EdTech: How to Rank Higher](https://www.prosalesconnection.com/blog/seo-for-edtech)
- [Ultimate Guide to SEO for EdTech](https://www.madx.digital/learn/seo-for-edtech)
- [Education SEO (Ahrefs)](https://ahrefs.com/blog/education-seo/)
- [Vercel Blog Starter Kit with Sanity](https://vercel.com/templates/next.js/blog-next-sanity)
- [EdTech Marketing Strategy Guide](https://saassy.agency/edtech-marketing-strategy/)
- [B2B SaaS Marketing Case Studies](https://www.poweredbysearch.com/blog/saas-marketing-case-studies/)
- [Content Marketing for Higher Education](https://www.manaferra.com/content-marketing-for-higher-education/)
