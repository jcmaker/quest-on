## 2026-03-06

- QA 증상을 제품 정책으로 즉시 해석하지 않는다.
- 먼저 `정책 허용 여부`, `평가 로직`, `UX/렌더링 문제`를 분리해 확인한다.
- 직접 답변 제공처럼 허용된 동작은 차단하지 말고, 평가 근거와 회복 여부를 구조화해서 반영한다.
- 사용자가 `Mermaid만` 원하면 문서형 설명보다 다이어그램 파일과 렌더 산출물을 우선 만든다.
- 구조 리뷰 요청도 사용자가 다이어그램 중심을 명시하면 `섹션별 .mmd + 렌더 검증` 형태로 제공한다.

## 2026-05-18

- 사용자가 단순화를 요청한 폼 UI에서는 내부적으로 자동 생성되거나 완료 후에만 필요한 값(예: 접속 코드)을 작성 중 화면에 노출하지 않는다.
- 참고 UI가 넓은 여백과 독립 질문 블록을 쓰는 경우, fieldset/legend처럼 전체 섹션을 테두리로 감싸는 패턴을 피하고 실제 입력 컨트롤에만 경계를 둔다.

## 2026-05-24 — Claude Harness v2 리팩토링

- 계층형 CLAUDE.md 도입: 영역별 규칙은 하위 디렉토리(`app/api/`, `components/`, `prisma/`) CLAUDE.md에 두어 자동 로드되게 함. 루트는 공통 원칙만.
- DB는 Prisma 클라이언트가 아닌 Supabase JS(`getSupabaseServer()`) 사용 — 과거 문서가 잘못 안내했음. `database/NNN_*.sql`이 DDL의 source of truth, `prisma/schema.prisma`는 introspection용.
- Skill/Command 구분: Skill은 description 매칭으로 자동 호출, Command는 사용자가 `/`로 명시 호출. qa-* 9종은 진입 비용 때문에 사장됐던 자산 — Skill 3개(api-route, data-flow-audit, test-author)로 압축.
- 자가 진화는 화이트리스트 파일만 (`tasks/lessons.md`, `.claude/CHANGELOG.md`). 소스 코드 자동 commit 절대 금지, push도 절대 금지.
