import { koKR } from "@clerk/localizations";
import type { Appearance } from "@clerk/types";

/**
 * Clerk 전역 appearance 설정
 * 모든 Clerk 컴포넌트에 기본적으로 적용됩니다.
 * 개별 컴포넌트에서 appearance를 전달하면 이 설정과 병합됩니다.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "hsl(var(--primary))",
    colorText: "hsl(var(--foreground))",
    colorTextSecondary: "hsl(var(--muted-foreground))",
    colorBackground: "hsl(var(--background))",
    colorInputBackground: "hsl(var(--background))",
    colorInputText: "hsl(var(--foreground))",
    borderRadius: "calc(var(--radius) - 2px)",
    fontFamily: "var(--font-geist-sans)",
    fontSize: "14px",
  },
  elements: {
    // 전역 버튼 스타일
    formButtonPrimary:
      "bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors",
    formButtonSecondary:
      "bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors",
    
    // 입력 필드 스타일
    formFieldInput:
      "border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-ring w-full",
    formFieldLabel: "text-foreground font-medium block mb-1",
    
    // 필드 레이아웃: 세로 배치 (위아래) - 각 필드를 블록 요소로 강제
    formField: "w-full mb-4 block",
    formFieldRow: "flex flex-col space-y-0 w-full",
    
    // 카드 및 컨테이너
    card: "bg-card shadow-none border border-border",
    rootBox: "w-full",
    
    // 헤더 (필요시 숨김)
    headerTitle: "text-foreground font-bold",
    headerSubtitle: "text-muted-foreground",
    
    // 소셜 로그인 버튼
    socialButtonsBlockButton:
      "border border-input bg-background hover:bg-accent text-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    
    // 링크 및 액션
    footerActionLink: "text-primary hover:text-primary/80 underline",
    formFieldAction: "text-primary hover:text-primary/80",
    
    // 구분선
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    
    // 에러 메시지
    formFieldErrorText: "text-destructive text-sm",
    
    // 폼 컨테이너: 필드들을 세로로 배치
    form: "flex flex-col space-y-4",
  },
};

/**
 * Clerk 한국어 localization 설정
 */
export const clerkLocalization = koKR;
