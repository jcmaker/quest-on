import Link from "next/link";

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">개인정보처리방침</h1>
        <p className="text-muted-foreground">
          최종 수정일: 2025년 1월 1일
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. 수집 항목</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">필수 항목</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>계정 정보:</strong> 이름, 이메일, 소속기관, 역할(교육자/응시자), 로그인 식별자
              </li>
              <li>
                <strong>시험 운영 데이터:</strong> 시험 코드, 응시 시간, 제출 답안, 루브릭 점수, 피드백 로그
              </li>
              <li>
                <strong>AI 상호작용 기록:</strong> 질문/응답(Clarification), 리플렉션 Q&amp;A 로그
              </li>
              <li>
                <strong>기기/접속 정보:</strong> IP, 브라우저/OS, 접속 일시, 로그(보안/오류 분석 목적)
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">선택 항목</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>고객지원 문의 내용/첨부파일</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. 처리 목적</h2>
        
        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>회원 가입 및 본인 확인, 역할(교육자/응시자) 구분</li>
            <li>시험 진행(응시, 답안 제출), 결과 산출, 리포트 제공</li>
            <li>AI 기능 제공(질문 응답, 피드백) 및 부정 사용 탐지</li>
            <li>고객 문의 대응, 공지 전달</li>
            <li>서비스 안정성(오류/보안 로그 분석)</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. 보유/이용 기간</h2>
        
        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>계정 정보:</strong> 회원 탈퇴 후 30일 보관 후 파기(또는 법령 보관 기간 준수)
            </li>
            <li>
              <strong>시험/답안/AI 로그:</strong> 교육기관 계약 종료 후 1년 또는 교육자가 설정한 기간
            </li>
            <li>
              <strong>접속 로그:</strong> 보안 목적 90일 보관
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            보유기간은 &quot;최소 필요 기간&quot; 원칙을 따릅니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. 제3자 제공 / 처리위탁</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">제3자 제공</h3>
            <p>원칙적으로 제3자에게 개인정보를 제공하지 않습니다.</p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">처리위탁</h3>
            <p className="mb-2">서비스 제공을 위해 다음 업체에 위탁하고 있습니다:</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border border-border">위탁사</th>
                    <th className="px-4 py-2 text-left border border-border">업무</th>
                    <th className="px-4 py-2 text-left border border-border">보관기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border border-border">클라우드 호스팅 업체</td>
                    <td className="px-4 py-2 border border-border">데이터 저장 및 서버 운영</td>
                    <td className="px-4 py-2 border border-border">서비스 제공 기간</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border border-border">이메일 발송 업체</td>
                    <td className="px-4 py-2 border border-border">이메일 발송</td>
                    <td className="px-4 py-2 border border-border">발송 완료 시까지</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border border-border">LLM API 제공사</td>
                    <td className="px-4 py-2 border border-border">AI 기능 처리</td>
                    <td className="px-4 py-2 border border-border">처리 완료 시까지</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. 국외 이전</h2>
        
        <div className="space-y-4">
          <p>
            AI API 및 클라우드 서비스가 해외 서버를 사용할 경우, 개인정보가 국외로 이전될 수 있습니다.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>이전 국가:</strong> 미국</li>
            <li><strong>이전 항목:</strong> 답안, AI 질문/응답 로그</li>
            <li><strong>이전 목적:</strong> AI 기능 제공</li>
            <li><strong>보유기간:</strong> 처리 완료 시까지</li>
            <li><strong>거부 방법:</strong> 서비스 이용 중단 시 처리 중단 가능</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. 이용자 권리</h2>
        
        <div className="space-y-4">
          <p>
            이용자는 개인정보 열람·정정·삭제·처리정지 등을 요청할 수 있으며, 요청은 다음 경로로
            접수합니다:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>이메일: questonkr@gmail.com</li>
            <li>고객센터: 서비스 내 문의하기</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            미성년자의 경우 법정대리인을 통해 요청할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. 안전성 확보조치</h2>
        
        <div className="space-y-4">
          <p>
            회사는 개인정보보호법령에 따라 다음 안전성 확보조치를 적용합니다:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>접근통제 및 권한관리</li>
            <li>암호화(전송구간, 저장 시)</li>
            <li>접속기록 보관 및 점검</li>
            <li>보안 프로그램 설치 및 갱신</li>
            <li>정기적 보안 점검 및 교육</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. 문의처</h2>
        
        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4">
            <p><strong>개인정보 보호책임자</strong></p>
            <p>이메일: questonkr@gmail.com</p>
            <p className="mt-2 text-sm text-muted-foreground">
              개인정보 관련 문의 및 고충처리, 분쟁조정은 위 연락처로 접수하실 수 있습니다.
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

