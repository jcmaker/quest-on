import Link from "next/link";
import { ShieldCheck, Lock, Eye, Database, AlertTriangle } from "lucide-react";

export default function SecurityPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">데이터 보안</h1>
        <p className="text-muted-foreground">
          Quest-On은 개인정보 및 시험 데이터 보호를 최우선으로 합니다.
        </p>
      </header>

      <section className="mb-12">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            데이터 보호 원칙
          </h2>
          <p>
            Quest-On은 개인정보 및 시험 데이터 보호를 위해 최소수집, 최소권한, 암호화, 감사로그,
            사고대응 원칙을 적용합니다. 관련 법령 기준의 안전성 확보조치를 준수합니다.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-6 h-6" />
          기술적 보호조치
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">전송구간 암호화</h3>
            <p>
              모든 데이터 전송은 HTTPS/TLS 1.3을 사용하여 암호화됩니다. 민감한 정보의 전송 시
              추가 보안 계층을 적용합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">저장 시 암호화</h3>
            <p>
              데이터베이스 및 스토리지에 저장되는 민감한 정보는 암호화되어 저장됩니다. 암호화 키는
              안전하게 관리되며, 정기적으로 로테이션됩니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">접근통제/권한관리</h3>
            <p>
              역할 기반 접근제어(RBAC)를 적용하여 최소권한 원칙을 준수합니다. 관리자 접근은
              다중인증을 요구하며, 모든 접근은 기록됩니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">세션/인증 보안</h3>
            <p>
              안전한 세션 토큰을 사용하며, 만료 시간을 설정하여 재인증을 요구합니다. CSRF 방어
              메커니즘을 적용하여 공격을 방지합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">로그/모니터링</h3>
            <p>
              중요 이벤트에 대한 감사로그를 보관하며, 이상징후 탐지 시스템을 운영합니다. 장애 및
              보안 사고 발생 시 즉시 알림을 받아 대응합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">백업/복구</h3>
            <p>
              정기적으로 데이터 백업을 수행하며, 복구 테스트를 통해 백업의 무결성을 확인합니다.
              백업 데이터 역시 암호화되어 별도로 보관됩니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Database className="w-6 h-6" />
          운영적/관리적 조치
        </h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">임직원 관리</h3>
            <p>
              임직원의 접근 권한을 정기적으로 점검하며, 보안 교육을 실시합니다. 퇴직 시 즉시
              접근 권한을 회수합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">취약점 점검/패치</h3>
            <p>
              정기적으로 보안 취약점을 점검하며, 발견된 취약점은 즉시 패치합니다. 의존성 업데이트를
              포함한 전체적인 보안 업데이트를 수행합니다.
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">침해사고 대응</h3>
            <p>
              침해사고 발생 시 탐지→차단→통지→재발방지 절차에 따라 신속하게 대응합니다. 사고
              발생 시 관련 기관 및 이용자에게 신속히 통지합니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" />
          보안 제보 채널
        </h2>
        
        <div className="space-y-4">
          <p>
            보안 취약점을 발견하신 경우 다음 채널로 제보해 주시기 바랍니다:
          </p>
          <div className="bg-muted rounded-lg p-4">
            <p><strong>이메일:</strong> security@queston.co.kr</p>
            <p className="mt-2 text-sm text-muted-foreground">
              제보 시 처리 절차: 접수 → 확인 → 조치 → 결과 안내
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            책임 있는 정보 공개(Responsible Disclosure) 원칙을 따르며, 신속한 대응을 위해
            노력하겠습니다.
          </p>
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
          <Link href="/legal/cookies" className="hover:text-foreground transition-colors">
            쿠키 정책
          </Link>
        </div>
      </footer>
    </article>
  );
}

