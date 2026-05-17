"use client";

/**
 * AgentCursor — 에이전트의 "떠다니는 커서" 시각 요소.
 *
 * AgentPresenceProvider 가 내부적으로 렌더한다. 일반적으로 통합 담당이
 * 직접 import 할 필요는 없지만, 커스텀 배치를 원하면 단독 사용도 가능하다.
 *
 * Export:
 *   - `AgentCursor` (default + named) — 위치/라벨/가시성 props 를 받는 표현용 컴포넌트.
 *   - `AGENT_CURSOR_SIZE` — 커서 그래픽의 픽셀 크기 (히트 포인트 보정용).
 *
 * Props:
 *   - `x`, `y`     : viewport 기준 좌표 (px). 커서 "촉(tip)"이 이 좌표에 온다.
 *   - `visible`    : 표시 여부. false 면 페이드아웃.
 *   - `label`      : 커서를 따라다니는 상태 라벨 텍스트 (없으면 라벨 미표시).
 *   - `active`     : true 면 클릭/조작 중을 나타내는 펄스 강조.
 *
 * 디자인 메모:
 *   - 실제 OS 마우스 커서와 헷갈리지 않도록 화살촉 대신 둥근 점 + 링 + 코멧
 *     꼬리 형태를 쓰고, primary 색을 입혀 "소프트웨어가 그린 커서"임을 명확히 한다.
 *   - `pointer-events-none` 으로 실제 입력을 절대 가로채지 않는다.
 *   - z-index 는 거의 최상단(`z-[9998]`)이되 토스트/모달보다 한 단계 아래로 둔다.
 */

import { motion, AnimatePresence } from "motion/react";

/** 커서 그래픽의 시각적 지름(px). tip 보정에 사용. */
export const AGENT_CURSOR_SIZE = 22;

export interface AgentCursorProps {
  /** viewport 기준 X 좌표(px) — 커서 tip 이 위치할 지점 */
  x: number;
  /** viewport 기준 Y 좌표(px) — 커서 tip 이 위치할 지점 */
  y: number;
  /** 표시 여부 */
  visible: boolean;
  /** 커서를 따라다니는 상태 라벨 (null/undefined 면 미표시) */
  label?: string | null;
  /** 조작(클릭/타이핑) 중 강조 펄스 */
  active?: boolean;
}

export function AgentCursor({
  x,
  y,
  visible,
  label,
  active = false,
}: AgentCursorProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          // 좌표 자체는 spring 으로 부드럽게 이동. 진입/이탈은 opacity+scale.
          className="pointer-events-none fixed left-0 top-0 z-[9998] select-none"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: 1,
            scale: 1,
            x,
            y,
          }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{
            opacity: { duration: 0.18 },
            scale: { duration: 0.18 },
            x: { type: "spring", stiffness: 480, damping: 38, mass: 0.7 },
            y: { type: "spring", stiffness: 480, damping: 38, mass: 0.7 },
          }}
        >
          {/* 커서 그래픽 — tip 이 (x, y) 에 오도록 translate 보정 */}
          <div
            className="relative"
            style={{ transform: `translate(-4px, -4px)` }}
          >
            {/* 조작 중 펄스 링 */}
            <AnimatePresence>
              {active && (
                <motion.span
                  className="absolute left-1/2 top-1/2 rounded-full bg-primary/30"
                  style={{ width: AGENT_CURSOR_SIZE, height: AGENT_CURSOR_SIZE }}
                  initial={{ x: "-50%", y: "-50%", scale: 0.5, opacity: 0.7 }}
                  animate={{
                    x: "-50%",
                    y: "-50%",
                    scale: [0.5, 1.9],
                    opacity: [0.7, 0],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>

            {/* 코멧 꼬리 — 정지 상태에선 거의 안 보이고 이동 중 늘어난 느낌 */}
            <span
              className="absolute left-[3px] top-[3px] -z-10 h-3 w-3 rounded-full bg-primary/20 blur-[3px]"
              aria-hidden
            />

            {/* 본체: 외곽 링 + 코어 점 */}
            <div
              className="flex items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/70 shadow-[0_2px_8px_rgba(0,0,0,0.25)] backdrop-blur-[1px]"
              style={{ width: AGENT_CURSOR_SIZE, height: AGENT_CURSOR_SIZE }}
            >
              <span className="h-2 w-2 rounded-full bg-primary" />
            </div>
          </div>

          {/* 상태 라벨 — 커서 우하단에 칩 형태로 따라붙음 */}
          <AnimatePresence>
            {label && (
              <motion.div
                key={label}
                className="absolute left-[26px] top-[18px] whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-md"
                initial={{ opacity: 0, x: -4, y: -2 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.16 }}
              >
                {label}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AgentCursor;
