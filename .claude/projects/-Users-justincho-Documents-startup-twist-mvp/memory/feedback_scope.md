---
name: feedback_scope
description: 과제 페이지 작업 시 시험 생성 페이지를 건드리지 말 것
type: feedback
---

과제 관련 작업 요청 시 시험 생성 페이지(instructor/new, instructor/[examId]/edit 등)는 수정하지 말 것.

**Why:** 사용자는 과제 페이지만 수정을 원했는데 시험 페이지까지 변경 범위가 확대된 것에 불편함을 표현함.

**How to apply:** 공유 컴포넌트를 수정할 때는 기존 시험 페이지 동작을 보존하는 방식(mode prop 기본값 유지 등)을 사용하되, 시험 생성 페이지 파일 자체는 직접 수정하지 말 것. 과제 페이지 작업임을 명확히 인지하고 범위를 제한할 것.
