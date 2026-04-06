"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { Clock, Copy, Mail, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const CONTACT_EMAIL = "questonkr@gmail.com";

export default function InstructorPendingPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const emailSubject = encodeURIComponent("[Quest-On 강사 승인 요청]");
  const emailBody = encodeURIComponent(
`안녕하십니까,

Quest-On 서비스에 관심 가져주셔서 감사합니다.

강사 계정 승인을 요청드립니다.

아래 정보를 함께 보내주시면 빠르게 처리해드리겠습니다:

- 성함:
- 소속 기관 (대학교/회사명):
- 담당 과목:
- 사용 목적:
- 가입 이메일: ${user?.primaryEmailAddress?.emailAddress || ""}

감사합니다.`
  );

  const mailtoLink = `mailto:${CONTACT_EMAIL}?subject=${emailSubject}&body=${emailBody}`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 아이콘 */}
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>

        {/* 제목 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">승인 대기 중입니다</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            강사 계정은 관리자 승인 후 사용 가능합니다.
            <br />
            아래 이메일로 문의해 주시면 빠르게 처리해드리겠습니다.
          </p>
        </div>

        {/* 이메일 + 복사 */}
        <div className="bg-muted rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span>문의 이메일</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-primary font-semibold text-lg">
              {CONTACT_EMAIL}
            </span>
            <button
              onClick={handleCopyEmail}
              className="p-1.5 rounded-md hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
              title="이메일 복사"
            >
              {copied
                ? <Check className="w-4 h-4 text-green-500" />
                : <Copy className="w-4 h-4" />
              }
            </button>
          </div>
          {copied && (
            <p className="text-xs text-green-600">이메일이 복사되었습니다!</p>
          )}
        </div>

        {/* 문의하기 버튼 */}
        <a href={mailtoLink} className="block">
          <Button className="w-full h-12 gap-2">
            <Mail className="w-4 h-4" />
            문의하기 (이메일 작성)
          </Button>
        </a>

        {/* 안내 */}
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-left space-y-1.5">
          <p className="font-medium text-foreground mb-2">📋 이메일에 포함해주세요</p>
          <p>• 소속 기관 (대학교/회사명)</p>
          <p>• 담당 과목</p>
          <p>• 사용 목적</p>
        </div>

        {/* 승인 확인 버튼 */}
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="w-full"
        >
          승인 여부 확인하기
        </Button>

        {/* 로그아웃 */}
        <Button
          variant="ghost"
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="w-full text-muted-foreground gap-2"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}
