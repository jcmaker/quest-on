# Quest-On - 현대적인 학습 플랫폼

Quest-On는 강사와 학생을 연결하는 현대적인 학습 플랫폼입니다. AI 피드백과 함께 시험을 치고, 진행 상황을 추적하며, 상호작용적인 학습 환경을 제공합니다.

## 주요 기능

### 강사용

- 새로운 시험 생성 및 관리
- 학생 진행 상황 모니터링
- 시험 결과 분석 및 피드백
- 시험 코드 공유

### 학생용

- 시험 코드를 통한 시험 참여
- AI 질문 및 답변 시스템
- 실시간 진행 상황 추적
- 상세한 피드백 및 분석

## 기술 스택

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **Authentication**: Clerk
- **Database**: Supabase (예정)
- **AI**: OpenAI API (예정)

## 시작하기

### 필수 요구사항

- Node.js 18.0 이상
- npm, yarn, pnpm 또는 bun

### 설치 및 실행

1. 저장소 클론

```bash
git clone <repository-url>
cd quest-on-mvp
```

2. 의존성 설치

```bash
npm install
# 또는
yarn install
# 또는
pnpm install
```

3. 환경 변수 설정
   `.env.local` 파일을 생성하고 필요한 환경 변수를 설정하세요:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret
```

4. 개발 서버 실행

```bash
npm run dev
# 또는
yarn dev
# 또는
pnpm dev
```

5. 브라우저에서 [http://localhost:3000](http://localhost:3000) 열기

## 프로젝트 구조

```
quest-on-mvp/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 인증 관련 페이지
│   ├── api/               # API 라우트
│   ├── exam/              # 시험 관련 페이지
│   ├── instructor/        # 강사 대시보드
│   ├── student/           # 학생 대시보드
│   └── onboarding/        # 온보딩 페이지
├── components/             # 재사용 가능한 컴포넌트
│   ├── auth/              # 인증 관련 컴포넌트
│   └── ui/                # UI 컴포넌트
├── lib/                    # 유틸리티 함수
└── public/                 # 정적 파일
```

## 개발 가이드

### 새 페이지 추가

`app/` 디렉토리에 새 폴더와 `page.tsx` 파일을 생성하세요.

### 새 컴포넌트 추가

`components/` 디렉토리에 새 컴포넌트를 추가하세요.

### API 엔드포인트 추가

`app/api/` 디렉토리에 새 라우트를 추가하세요.

## 배포

### Vercel (권장)

[Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)을 사용하여 쉽게 배포할 수 있습니다.

### 기타 플랫폼

Next.js는 다양한 플랫폼에서 배포할 수 있습니다. 자세한 내용은 [Next.js 배포 문서](https://nextjs.org/docs/app/building-your-application/deploying)를 참조하세요.

## 기여하기

프로젝트에 기여하고 싶으시다면:

1. 이 저장소를 포크하세요
2. 새 기능 브랜치를 생성하세요 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋하세요 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시하세요 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성하세요

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 지원

문제가 있거나 질문이 있으시다면 이슈를 생성해 주세요.

---

**Quest-On** - 더 나은 학습을 위한 현대적인 플랫폼
