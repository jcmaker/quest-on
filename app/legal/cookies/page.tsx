import Link from "next/link";
import { Cookie } from "lucide-react";

export default function CookiesPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4 flex items-center gap-2">
          <Cookie className="w-8 h-8" />
          쿠키 정책
        </h1>
        <p className="text-muted-foreground">
          최종 수정일: 2025년 1월 1일
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. 쿠키란?</h2>
        
        <div className="space-y-4">
          <p>
            쿠키는 이용자가 웹사이트를 방문할 때 브라우저에 저장되는 작은 텍스트 파일로, 로그인
            유지, 설정 저장, 이용 통계 분석 등에 사용됩니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. 쿠키 사용 목적</h2>
        
        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>필수 기능 제공(로그인 세션 유지, 보안 토큰)</li>
            <li>환경설정 저장(다크모드, 언어)</li>
            <li>서비스 품질 개선을 위한 통계(방문/이용 흐름)</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. 쿠키 유형</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">필수 쿠키 (Strictly Necessary)</h3>
            <p>
              로그인 및 보안에 필요한 쿠키입니다. 이 쿠키를 거부할 경우 서비스 이용이 어려울 수
              있습니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">기능 쿠키 (Functional)</h3>
            <p>
              사용자 설정(다크모드, 언어 등)을 저장하여 향후 방문 시 동일한 환경을 제공합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">분석 쿠키 (Analytics)</h3>
            <p>
              서비스 이용 통계를 수집하여 사용자 경험 개선에 활용합니다. 개인을 식별할 수 없는
              형태로 수집됩니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. 사용하는 쿠키 목록</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full border border-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left border border-border">쿠키 이름</th>
                <th className="px-4 py-2 text-left border border-border">목적</th>
                <th className="px-4 py-2 text-left border border-border">유형</th>
                <th className="px-4 py-2 text-left border border-border">보관기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">session</td>
                <td className="px-4 py-2 border border-border">로그인 세션 유지</td>
                <td className="px-4 py-2 border border-border">필수</td>
                <td className="px-4 py-2 border border-border">브라우저 종료 시</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">csrf_token</td>
                <td className="px-4 py-2 border border-border">보안(요청 위조 방지)</td>
                <td className="px-4 py-2 border border-border">필수</td>
                <td className="px-4 py-2 border border-border">24시간</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">theme</td>
                <td className="px-4 py-2 border border-border">다크모드 설정</td>
                <td className="px-4 py-2 border border-border">기능</td>
                <td className="px-4 py-2 border border-border">1년</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">analytics_id</td>
                <td className="px-4 py-2 border border-border">이용 통계</td>
                <td className="px-4 py-2 border border-border">분석</td>
                <td className="px-4 py-2 border border-border">2년</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. 쿠키 설정 변경 방법</h2>
        
        <div className="space-y-4">
          <p>
            이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만 필수 쿠키를
            차단할 경우 로그인 등 일부 기능이 동작하지 않을 수 있습니다.
          </p>
          
          <div>
            <h3 className="text-xl font-medium mb-2">주요 브라우저 쿠키 설정 방법</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Chrome:</strong> 설정 → 개인정보 및 보안 → 쿠키 및 기타 사이트 데이터
              </li>
              <li>
                <strong>Firefox:</strong> 설정 → 개인정보 보호 → 쿠키 및 사이트 데이터
              </li>
              <li>
                <strong>Safari:</strong> 환경설정 → 개인정보 보호 → 쿠키 및 웹 사이트 데이터
              </li>
              <li>
                <strong>Edge:</strong> 설정 → 쿠키 및 사이트 권한 → 쿠키 및 사이트 데이터
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm">
              <strong>참고:</strong> 분석 쿠키에 대한 동의는 서비스 내 설정 페이지에서 개별적으로
              철회할 수 있습니다. (준비 중)
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-border">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground transition-colors">
            이용약관
          </Link>
          <span>·</span>
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
            개인정보처리방침
          </Link>
          <span>·</span>
          <Link href="/legal/security" className="hover:text-foreground transition-colors">
            데이터 보안
          </Link>
        </div>
      </footer>
    </article>
  );
}

