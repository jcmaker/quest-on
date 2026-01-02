import Link from "next/link";

export default function TermsPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">이용약관</h1>
        <p className="text-muted-foreground">
          최종 수정일: 2025년 1월 1일
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. 목적/정의</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">제1조(목적)</h3>
            <p>
              본 약관은 Quest-On(이하 &quot;회사&quot;)이 제공하는 AI 기반 시험/평가 플랫폼
              서비스의 이용과 관련하여 회사와 이용자의 권리·의무 및 책임사항, 기타 필요한
              사항을 규정함을 목적으로 합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">제2조(정의)</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                &quot;이용자&quot;는 교육자(교수/강사/관리자) 및 응시자를 포함합니다.
              </li>
              <li>
                &quot;콘텐츠&quot;는 시험, 루브릭, 답안, AI 대화 기록, 피드백, 업로드 자료
                등을 의미합니다.
              </li>
              <li>
                &quot;서비스&quot;는 회사가 제공하는 AI 기반 시험/평가 플랫폼 전반을 의미합니다.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. 계정/접속</h2>
        
        <div className="space-y-4">
          <p>
            이용자는 정확한 정보를 제공해야 하며, 계정 공유·대여·양도는 금지됩니다. 회사는
            이상 징후(동시 접속, 비정상 요청 등)가 확인되면 보안상 필요한 범위에서 접근을
            제한할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">
          3. 서비스 범위 &amp; AI 기능 고지
        </h2>
        
        <div className="space-y-4">
          <p>
            본 서비스는 다음 기능을 제공합니다:
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>시험 생성/배포</li>
            <li>응시자의 AI 질의(Clarification)</li>
            <li>답안 제출</li>
            <li>AI 기반 피드백/리플렉션 및 결과 리포트 제공</li>
          </ol>
          
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm">
              <strong>중요:</strong> AI가 생성하는 답변·피드백은 통계적 모델 결과로 부정확/불완전할 수
              있으며, 최종 판단과 제출 책임은 이용자에게 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. 금지행위(부정행위/보안)</h2>
        
        <div className="space-y-4">
          <p>이용자는 다음 행위를 해서는 안 됩니다:</p>
          
          <ul className="list-disc pl-6 space-y-2">
            <li>
              시험/평가의 공정성을 훼손하는 행위(대리응시, 계정 공유, 부정한 자료 반입/유출 등)
            </li>
            <li>
              서비스/서버에 과도한 부하를 유발하는 자동화 요청, 크롤링, 리버스 엔지니어링
            </li>
            <li>
              타인의 개인정보/저작권 침해, 불법 정보 업로드
            </li>
            <li>
              기타 관련 법령 및 본 약관을 위반하는 행위
            </li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. 콘텐츠 권리/라이선스</h2>
        
        <div className="space-y-4">
          <p>
            이용자가 업로드한 자료 및 작성한 답안의 권리는 원칙적으로 이용자(또는 소속기관/교육자)에게
            귀속됩니다. 다만 회사는 서비스 제공·개선·보안·분쟁 대응을 위해 필요한 범위에서 콘텐츠를
            처리(저장·전송·분석)할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. 이용 제한/해지</h2>
        
        <div className="space-y-4">
          <p>
            이용자가 약관 위반 또는 보안 위험을 초래한 경우 회사는 사전 통지 후 이용을 제한할 수
            있습니다. 긴급한 경우 사후 통지할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. 책임 제한</h2>
        
        <div className="space-y-4">
          <p>
            회사는 천재지변, 장애, 통신사 사정 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지
            않습니다(관련 법령이 허용하는 한도). AI 결과물의 정확성/적합성에 대해 보증하지 않습니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. 준거법/분쟁</h2>
        
        <div className="space-y-4">
          <p>
            본 약관은 대한민국 법령을 준거법으로 하며, 분쟁은 서울중앙지방법원을 전속 관할로 합니다.
          </p>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-border">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
            개인정보처리방침
          </Link>
          <span>·</span>
          <Link href="/legal/security" className="hover:text-foreground transition-colors">
            데이터 보안
          </Link>
          <span>·</span>
          <Link href="/legal/cookies" className="hover:text-foreground transition-colors">
            쿠키 정책
          </Link>
        </div>
      </footer>
    </article>
  );
}

