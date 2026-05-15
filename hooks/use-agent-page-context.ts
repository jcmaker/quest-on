"use client";

import { usePathname } from "next/navigation";
import type { AgentPageContext } from "@/lib/agent/types";

/**
 * 강사 에이전트 패널이 새 런 생성 시 함께 전송하는 페이지 컨텍스트.
 *
 * usePathname() 으로 현재 강사 경로를 파싱해서:
 *  - route:  매칭된 라우트 패턴 (예: "/instructor/[examId]")
 *  - examId: 시험 상세/편집/과제 경로일 때 추출한 ID
 *  - label:  사람이 읽는 화면 설명
 *
 * 에이전트 input.pageContext 계약(lib/agent/types.ts)에 맞춘다.
 */

interface RouteRule {
  /** 정규식 — pathname 매칭 */
  pattern: RegExp;
  /** AgentPageContext.route 에 들어갈 정규화된 라우트 */
  route: string;
  /** 사람이 읽는 라벨 */
  label: string;
  /** match 그룹에서 examId 추출 (있을 때) */
  examIdGroup?: number;
}

/**
 * 구체적인 경로가 먼저 오도록 정렬 (앞에서부터 첫 매칭 사용).
 */
const ROUTE_RULES: RouteRule[] = [
  {
    pattern: /^\/instructor\/new\/?$/,
    route: "/instructor/new",
    label: "새 시험 생성",
  },
  {
    pattern: /^\/instructor\/assignment\/new\/?$/,
    route: "/instructor/assignment/new",
    label: "과제 만들기",
  },
  {
    pattern: /^\/instructor\/assignment\/([^/]+)\/?$/,
    route: "/instructor/assignment/[assignmentId]",
    label: "과제 상세",
    examIdGroup: 1,
  },
  {
    pattern: /^\/instructor\/([^/]+)\/edit\/?$/,
    route: "/instructor/[examId]/edit",
    label: "시험 편집",
    examIdGroup: 1,
  },
  {
    pattern: /^\/instructor\/([^/]+)\/?$/,
    route: "/instructor/[examId]",
    label: "시험 상세",
    examIdGroup: 1,
  },
  {
    pattern: /^\/instructor\/?$/,
    route: "/instructor",
    label: "강사 대시보드",
  },
];

/** 매칭되는 라우트가 없을 때의 폴백 */
function fallbackContext(pathname: string): AgentPageContext {
  return {
    route: pathname || "/instructor",
    label: "강사 페이지",
  };
}

/**
 * pathname 을 라우트 규칙에 매칭해 AgentPageContext 를 도출한다.
 * 순수 함수 — React Compiler 가 호출부 메모이제이션을 처리한다.
 */
function resolvePageContext(pathname: string): AgentPageContext {
  for (const rule of ROUTE_RULES) {
    const match = rule.pattern.exec(pathname);
    if (!match) continue;

    const examId =
      rule.examIdGroup !== undefined ? match[rule.examIdGroup] : undefined;

    return {
      route: rule.route,
      label: rule.label,
      ...(examId ? { examId } : {}),
    };
  }

  return fallbackContext(pathname);
}

export function useAgentPageContext(): AgentPageContext {
  const pathname = usePathname();
  return resolvePageContext(pathname ?? "/instructor");
}
