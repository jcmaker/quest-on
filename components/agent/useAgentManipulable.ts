"use client";

/**
 * useAgentManipulable — 요소를 "에이전트가 조작 중"으로 표시하는 편의 훅 (선택 사용).
 *
 * 편집기 통합 담당이 컨트롤마다 `presence.focusOn(ref.current, ...)` 을 직접
 * 부르는 대신, 이 훅으로 ref 와 명령형 헬퍼를 한 번에 받을 수 있다.
 * AgentPresenceProvider 하위에서만 동작한다.
 *
 * Export:
 *   - `useAgentManipulable<T>()` — ref + 헬퍼를 담은 객체 반환.
 *   - 타입: `AgentManipulable`.
 *
 * 반환값 (`const ctrl = useAgentManipulable<HTMLInputElement>()`):
 *   - `ctrl.ref`        : 대상 요소에 붙일 React ref. `<input ref={ctrl.ref} />`
 *   - `ctrl.focus(label?)`  : Promise<void> — 이 요소로 스크롤+커서+하이라이트(+라벨).
 *   - `ctrl.beginAction()`  : 커서를 "조작 중" 펄스로 켠다(클릭/타이핑 시작).
 *   - `ctrl.endAction()`    : 펄스를 끈다.
 *   - `ctrl.release()`      : 이 요소에서 프레즌스를 거둔다(clear).
 *   - `ctrl.element`        : 현재 ref 가 가리키는 HTMLElement | null.
 *
 * 사용 예:
 *   const title = useAgentManipulable<HTMLInputElement>();
 *   // ...
 *   <input ref={title.ref} value={value} onChange={...} />
 *
 *   async function agentTypesTitle(text: string) {
 *     await title.focus("제목 입력 중…");
 *     title.beginAction();
 *     await typeText({ target: text, onChange: setValue });
 *     title.endAction();
 *     title.release();
 *   }
 */

import { useCallback, useMemo, useRef } from "react";
import { useAgentPresence } from "./AgentPresenceProvider";

export interface AgentManipulable<T extends HTMLElement = HTMLElement> {
  /** 대상 요소에 붙일 ref */
  ref: React.RefObject<T | null>;
  /** 현재 ref 가 가리키는 요소 (없으면 null) */
  element: T | null;
  /** 이 요소로 스크롤 + 커서 이동 + 하이라이트. opts.label 로 상태 라벨 동시 설정. */
  focus: (label?: string | null) => Promise<void>;
  /** 커서를 "조작 중" 펄스 상태로 켠다. */
  beginAction: () => void;
  /** "조작 중" 펄스를 끈다. */
  endAction: () => void;
  /** 이 요소에서 프레즌스 제거(커서/하이라이트/라벨/펄스 초기화). */
  release: () => void;
}

export function useAgentManipulable<
  T extends HTMLElement = HTMLElement,
>(): AgentManipulable<T> {
  const presence = useAgentPresence();
  const ref = useRef<T | null>(null);

  const focus = useCallback(
    (label?: string | null) =>
      presence.focusOn(ref.current, { label: label ?? null }),
    [presence],
  );

  const beginAction = useCallback(() => presence.setActive(true), [presence]);
  const endAction = useCallback(() => presence.setActive(false), [presence]);
  const release = useCallback(() => presence.clear(), [presence]);

  return useMemo<AgentManipulable<T>>(
    () => ({
      ref,
      get element() {
        return ref.current;
      },
      focus,
      beginAction,
      endAction,
      release,
    }),
    [focus, beginAction, endAction, release],
  );
}
