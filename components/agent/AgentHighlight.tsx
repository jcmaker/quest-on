"use client";

/**
 * AgentHighlight — 대상 요소를 감싸는 포커스 링/글로우 오버레이.
 *
 * AgentPresenceProvider 가 내부적으로 렌더한다. `presence.highlight(el)` 로
 * 지정된 요소의 viewport 사각형(rect)을 받아 그 위에 떠 있는 강조 박스를
 * 그린다. 실제 요소를 감싸지 않고 좌표만 미러링하므로 레이아웃에 영향이 없다.
 *
 * Export:
 *   - `AgentHighlight` (default + named) — `rect` prop 으로 강조 박스를 그린다.
 *
 * Props:
 *   - `rect` : 강조할 요소의 viewport 기준 DOMRect. null 이면 페이드아웃 후 미표시.
 *   - `padding` : 요소 바깥으로 띄울 여백(px). 기본 6.
 *
 * 디자인 메모:
 *   - `pointer-events-none` + `fixed` — 입력을 가로채지 않고 스크롤과 함께 움직인다.
 *   - 링은 primary 색 + 부드러운 글로우. 진입 시 살짝 수축하며 "스냅"되는 느낌.
 *   - z-index 는 커서(`z-[9998]`)보다 한 단계 아래(`z-[9997]`).
 */

import { motion, AnimatePresence } from "motion/react";

export interface AgentHighlightProps {
  /** 강조할 요소의 viewport 기준 사각형. null 이면 미표시. */
  rect: DOMRect | null;
  /** 요소 바깥 여백(px). 기본 6. */
  padding?: number;
}

export function AgentHighlight({ rect, padding = 6 }: AgentHighlightProps) {
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          className="pointer-events-none fixed z-[9997] rounded-lg ring-2 ring-primary ring-offset-1 ring-offset-background"
          style={{
            boxShadow:
              "0 0 0 4px rgba(99,102,241,0.18), 0 6px 22px rgba(99,102,241,0.25)",
          }}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{
            opacity: 1,
            scale: 1,
            // 좌표는 spring 으로 부드럽게 따라간다(요소 간 이동 시).
            left: rect.left - padding,
            top: rect.top - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
          }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{
            opacity: { duration: 0.16 },
            scale: { duration: 0.2 },
            left: { type: "spring", stiffness: 520, damping: 40 },
            top: { type: "spring", stiffness: 520, damping: 40 },
            width: { type: "spring", stiffness: 520, damping: 40 },
            height: { type: "spring", stiffness: 520, damping: 40 },
          }}
        />
      )}
    </AnimatePresence>
  );
}

export default AgentHighlight;
