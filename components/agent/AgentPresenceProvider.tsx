"use client";

/**
 * AgentPresenceProvider + useAgentPresence — 에이전트 "체화 피드백" 레이어.
 *
 * 에이전트가 편집기 컨트롤을 조작할 때(제목 입력, 버튼 클릭 등) 강사에게
 * "에이전트가 직접 페이지를 만진다"는 시각 효과를 입히는 레이어다.
 * 실제 DOM 조작이 아니라 React 핸들러를 호출하되, 이 레이어가 그 위에
 * 떠다니는 커서 / 요소 하이라이트 / 상태 라벨을 얹는다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Export:
 *   - `AgentPresenceProvider`  — 앱(또는 편집기) 서브트리를 감싸는 컨텍스트 프로바이더.
 *                                커서와 하이라이트 오버레이를 직접 렌더한다.
 *   - `useAgentPresence()`     — 명령형 제어 메서드를 담은 컨텍스트 훅.
 *   - 타입: `AgentPresenceApi`, `AgentPresenceProviderProps`.
 *
 * Provider 사용:
 *   <AgentPresenceProvider>
 *     <ExamEditor />
 *   </AgentPresenceProvider>
 *
 * 훅 API (`const presence = useAgentPresence()`):
 *
 *   presence.moveCursorTo(el: HTMLElement | null): void
 *     — 에이전트 커서를 해당 요소의 중앙으로 애니메이션 이동.
 *       el 이 null 이면 커서를 숨긴다.
 *
 *   presence.highlight(el: HTMLElement | null): void
 *     — 대상 요소 위에 포커스 링/글로우 오버레이를 띄운다.
 *       el 이 null 이면 하이라이트를 제거한다.
 *
 *   presence.scrollIntoView(el: HTMLElement | null): Promise<void>
 *     — 요소를 화면 중앙으로 부드럽게 스크롤. 스크롤이 끝나면 resolve.
 *       el 이 null 이면 즉시 resolve.
 *
 *   presence.setStatusLabel(text: string | null): void
 *     — 커서를 따라다니는 작은 상태 라벨 설정("제목 입력 중…").
 *       null 이면 라벨 제거.
 *
 *   presence.setActive(active: boolean): void
 *     — 커서를 "조작 중" 펄스 상태로 토글(클릭/타이핑 순간 강조용).
 *
 *   presence.focusOn(el, opts?): Promise<void>
 *     — 편의 메서드. scrollIntoView → moveCursorTo → highlight 를 한 번에.
 *       opts.label 을 주면 setStatusLabel 도 함께 설정.
 *
 *   presence.clear(): void
 *     — 커서 / 하이라이트 / 라벨 / active 를 모두 제거(초기 상태).
 *
 * 통합 예시 (편집기 통합 담당용):
 *
 *   const presence = useAgentPresence();
 *   const titleRef = useRef<HTMLInputElement>(null);
 *
 *   async function agentFillsTitle(value: string) {
 *     await presence.focusOn(titleRef.current, { label: "제목 입력 중…" });
 *     presence.setActive(true);
 *     await typeText({ target: value, onChange: setTitle });
 *     presence.setActive(false);
 *     presence.clear();
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────
 * 디자인 메모:
 *   - 모든 좌표는 viewport 기준(`getBoundingClientRect`). 스크롤/리사이즈
 *     시 하이라이트 위치가 어긋나지 않도록 RAF 루프로 추적한다.
 *   - 오버레이는 전부 `pointer-events-none` — 실제 입력을 절대 가로채지 않는다.
 *   - Provider 가 없을 때 `useAgentPresence()` 를 호출하면 명확한 에러를 던진다.
 *   - `prefers-reduced-motion` 사용자는 motion 의 전역 reduced-motion 처리를
 *     따르며, 본 레이어는 추가 깜빡임을 만들지 않는다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgentCursor } from "./AgentCursor";
import { AgentHighlight } from "./AgentHighlight";

/** 훅이 노출하는 명령형 제어 API */
export interface AgentPresenceApi {
  /** 에이전트 커서를 요소 중앙으로 이동. null 이면 커서 숨김. */
  moveCursorTo: (el: HTMLElement | null) => void;
  /** 대상 요소에 포커스 링/글로우. null 이면 제거. */
  highlight: (el: HTMLElement | null) => void;
  /** 요소를 화면 중앙으로 부드럽게 스크롤. 끝나면 resolve. */
  scrollIntoView: (el: HTMLElement | null) => Promise<void>;
  /** 커서를 따라다니는 상태 라벨. null 이면 제거. */
  setStatusLabel: (text: string | null) => void;
  /** 커서 "조작 중" 펄스 토글. */
  setActive: (active: boolean) => void;
  /** scroll → 커서 이동 → 하이라이트(+라벨)를 한 번에. */
  focusOn: (
    el: HTMLElement | null,
    opts?: { label?: string | null },
  ) => Promise<void>;
  /** 커서/하이라이트/라벨/active 모두 제거. */
  clear: () => void;
}

export interface AgentPresenceProviderProps {
  children: ReactNode;
}

const AgentPresenceContext = createContext<AgentPresenceApi | null>(null);

/** 요소의 viewport 기준 중심 좌표 */
function centerOf(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 요소의 viewport 기준 사각형 (오버레이 추적용) */
function rectOf(el: HTMLElement): DOMRect {
  return el.getBoundingClientRect();
}

export function AgentPresenceProvider({
  children,
}: AgentPresenceProviderProps) {
  // 커서 상태
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [active, setActiveState] = useState(false);

  // 하이라이트 상태 — rect 는 추적 루프가 갱신
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  // 추적 대상 요소 ref (스크롤/리사이즈 시 좌표 재계산용)
  const cursorTargetRef = useRef<HTMLElement | null>(null);
  const highlightTargetRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  /**
   * RAF 추적 루프 — 추적 대상이 하나라도 있으면 매 프레임 좌표를 갱신해
   * 페이지 스크롤/레이아웃 변화에도 커서·하이라이트가 요소에 붙어 있게 한다.
   */
  useEffect(() => {
    function tick() {
      const cTarget = cursorTargetRef.current;
      if (cTarget && cTarget.isConnected) {
        const next = centerOf(cTarget);
        setCursor((prev) =>
          prev && prev.x === next.x && prev.y === next.y ? prev : next,
        );
      }

      const hTarget = highlightTargetRef.current;
      if (hTarget && hTarget.isConnected) {
        const next = rectOf(hTarget);
        setHighlightRect((prev) =>
          prev &&
          prev.x === next.x &&
          prev.y === next.y &&
          prev.width === next.width &&
          prev.height === next.height
            ? prev
            : next,
        );
      } else if (hTarget && !hTarget.isConnected) {
        // 대상이 DOM 에서 사라지면 하이라이트 정리
        highlightTargetRef.current = null;
        setHighlightRect(null);
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const moveCursorTo = useCallback((el: HTMLElement | null) => {
    cursorTargetRef.current = el;
    if (!el) {
      setCursorVisible(false);
      return;
    }
    setCursor(centerOf(el));
    setCursorVisible(true);
  }, []);

  const highlight = useCallback((el: HTMLElement | null) => {
    highlightTargetRef.current = el;
    setHighlightRect(el ? rectOf(el) : null);
  }, []);

  const scrollIntoView = useCallback(
    (el: HTMLElement | null): Promise<void> => {
      if (!el) return Promise.resolve();
      return new Promise((resolve) => {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        // smooth scroll 완료 이벤트가 표준화되어 있지 않아 시간 기반 대기.
        // 이미 보이는 요소면 사실상 즉시 resolve 되어도 무방.
        const timer = setTimeout(resolve, 420);
        // 호출자가 timer 를 직접 정리할 수단은 없지만, 짧아서 누수 위험 없음.
        void timer;
      });
    },
    [],
  );

  const setStatusLabel = useCallback((text: string | null) => {
    setLabel(text);
  }, []);

  const setActive = useCallback((value: boolean) => {
    setActiveState(value);
  }, []);

  const focusOn = useCallback(
    async (
      el: HTMLElement | null,
      opts?: { label?: string | null },
    ): Promise<void> => {
      if (opts && "label" in opts) setLabel(opts.label ?? null);
      if (!el) {
        moveCursorTo(null);
        highlight(null);
        return;
      }
      await scrollIntoView(el);
      moveCursorTo(el);
      highlight(el);
    },
    [moveCursorTo, highlight, scrollIntoView],
  );

  const clear = useCallback(() => {
    cursorTargetRef.current = null;
    highlightTargetRef.current = null;
    setCursorVisible(false);
    setHighlightRect(null);
    setLabel(null);
    setActiveState(false);
  }, []);

  const api = useMemo<AgentPresenceApi>(
    () => ({
      moveCursorTo,
      highlight,
      scrollIntoView,
      setStatusLabel,
      setActive,
      focusOn,
      clear,
    }),
    [
      moveCursorTo,
      highlight,
      scrollIntoView,
      setStatusLabel,
      setActive,
      focusOn,
      clear,
    ],
  );

  return (
    <AgentPresenceContext.Provider value={api}>
      {children}
      {/* 오버레이 레이어 — Provider 가 직접 렌더, pointer-events-none */}
      <AgentHighlight rect={highlightRect} />
      <AgentCursor
        x={cursor?.x ?? 0}
        y={cursor?.y ?? 0}
        visible={cursorVisible && cursor !== null}
        label={label}
        active={active}
      />
    </AgentPresenceContext.Provider>
  );
}

/**
 * 에이전트 프레즌스 제어 훅.
 * 반드시 `AgentPresenceProvider` 하위에서 호출해야 한다.
 */
export function useAgentPresence(): AgentPresenceApi {
  const ctx = useContext(AgentPresenceContext);
  if (!ctx) {
    throw new Error(
      "useAgentPresence() 는 <AgentPresenceProvider> 하위에서만 사용할 수 있습니다.",
    );
  }
  return ctx;
}
