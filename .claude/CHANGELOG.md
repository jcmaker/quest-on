# Claude Harness Changelog

이 파일은 `.claude/` 디렉토리 설정(CLAUDE.md, Skills, Hooks, settings.json)의 변경 이력을 추적한다. Stop hook이 화이트리스트로 자동 commit하는 대상 중 하나.

## 2026-05-24
- v2 리팩토링 완료: 기존 qa-* commands/agents/skills 폐기, 계층형 CLAUDE.md(app/api, components, prisma), Skills 3종(api-route, data-flow-audit, test-author), Hooks 3종(typecheck-incremental, api-rate-limit-check, session-evolve), settings.json 신규 작성.
