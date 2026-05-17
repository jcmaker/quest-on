/**
 * typeText — 타이프라이터 유틸.
 *
 * `target` 문자열을 한 글자씩(또는 청크 단위로) 점진적으로 잘라
 * `onChange(부분문자열)` 을 반복 호출한다. React controlled input/textarea 의
 * setState 를 `onChange` 로 넘기면, 에이전트가 직접 타이핑하는 것처럼
 * 입력값이 눈에 보이게 채워진다.
 *
 * 순수 유틸 — DOM 을 직접 만지지 않는다. 실제 값 반영은 호출자(React state)가 한다.
 *
 * Export:
 *   - `typeText(opts): Promise<void>`  — 타이핑 실행. 완료 시 resolve.
 *   - `clearText(opts): Promise<void>` — 기존 텍스트를 역으로 한 글자씩 지움(백스페이스 효과).
 *   - `TypeTextOptions` / `ClearTextOptions` 타입.
 *
 * 사용 예:
 *   const [title, setTitle] = useState("");
 *   await typeText({ target: "AI 윤리 중간고사", onChange: setTitle });
 *
 *   // 취소 지원
 *   const ctrl = new AbortController();
 *   typeText({ target: "...", onChange: setTitle, signal: ctrl.signal });
 *   ctrl.abort(); // → Promise 가 reject(AbortError) 됨
 *
 * 동작 메모:
 *   - 글자 사이 지연은 사람 같은 느낌을 위해 기본 속도에 ±40% 지터를 준다.
 *   - 공백/문장부호 뒤에는 살짝 더 머무른다(자연스러운 리듬).
 *   - `signal` 이 abort 되면 진행 중 타이핑을 멈추고 `AbortError` 로 reject.
 *     호출자는 보통 try/catch 로 무시하면 된다.
 *   - 멀티바이트(한글/이모지) 안전: `Array.from` 으로 코드포인트 단위 분할.
 */

export interface TypeTextOptions {
  /** 최종적으로 채워질 목표 문자열 */
  target: string;
  /** 부분 문자열이 길어질 때마다 호출 — controlled input 의 setState 를 넘긴다 */
  onChange: (value: string) => void;
  /** 글자당 평균 지연(ms). 기본 38ms */
  speedMs?: number;
  /** 취소용 AbortSignal (선택) */
  signal?: AbortSignal;
  /**
   * 한 번에 추가할 글자 수. 기본 1.
   * 긴 문단을 빠르게 채울 때 2~3 으로 올리면 자연스러움은 줄지만 빠르다.
   */
  chunkSize?: number;
  /**
   * 타이핑 시작 시점의 기존 값(이어쓰기 용). 기본 "".
   * target 이 이 값으로 시작하지 않으면 무시하고 처음부터 타이핑한다.
   */
  startFrom?: string;
}

export interface ClearTextOptions {
  /** 현재 입력값 — 이 길이만큼 한 글자씩 지운다 */
  current: string;
  /** 줄어든 문자열마다 호출 */
  onChange: (value: string) => void;
  /** 글자당 평균 지연(ms). 기본 18ms (지우기는 타이핑보다 빠르게) */
  speedMs?: number;
  /** 취소용 AbortSignal (선택) */
  signal?: AbortSignal;
}

/** abort 시 던지는 에러. 호출자는 .name === "AbortError" 로 식별 가능. */
class AbortError extends Error {
  constructor() {
    super("typeText aborted");
    this.name = "AbortError";
  }
}

/** signal 을 존중하는 지연. abort 시 즉시 reject. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 사람 같은 리듬을 위한 글자별 지연 계산 */
function delayForChar(char: string, baseMs: number): number {
  // ±40% 지터
  const jitter = baseMs * (0.6 + Math.random() * 0.8);
  // 공백/문장부호 뒤에는 살짝 더 머무름
  if (/[.,!?…\s\n]/.test(char)) return jitter + baseMs * 1.4;
  return jitter;
}

/**
 * target 문자열을 점진적으로 타이핑한다.
 * @returns 완료 시 resolve. abort 시 AbortError 로 reject.
 */
export async function typeText({
  target,
  onChange,
  speedMs = 38,
  signal,
  chunkSize = 1,
  startFrom = "",
}: TypeTextOptions): Promise<void> {
  if (signal?.aborted) throw new AbortError();

  const chars = Array.from(target);
  const step = Math.max(1, Math.floor(chunkSize));

  // 이어쓰기: target 이 startFrom 으로 시작하면 그 지점부터.
  let start = 0;
  if (startFrom && target.startsWith(startFrom)) {
    start = Array.from(startFrom).length;
  }

  // 시작 상태를 한 번 반영(이어쓰기 시 깜빡임 방지)
  if (start > 0) {
    onChange(chars.slice(0, start).join(""));
  } else {
    onChange("");
  }

  for (let i = start; i < chars.length; i += step) {
    const end = Math.min(i + step, chars.length);
    const slice = chars.slice(0, end).join("");
    onChange(slice);

    // 마지막 글자가 아니면 다음 글자 전 지연
    if (end < chars.length) {
      const lastChar = chars[end - 1] ?? "";
      await delay(delayForChar(lastChar, speedMs), signal);
    }
  }
}

/**
 * 기존 텍스트를 한 글자씩 역으로 지운다(백스페이스 효과).
 * 에이전트가 잘못 친 값을 "고쳐 쓰는" 연출에 사용.
 * @returns 완료 시 resolve. abort 시 AbortError 로 reject.
 */
export async function clearText({
  current,
  onChange,
  speedMs = 18,
  signal,
}: ClearTextOptions): Promise<void> {
  if (signal?.aborted) throw new AbortError();

  const chars = Array.from(current);
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    onChange(chars.slice(0, i).join(""));
    if (i > 0) {
      await delay(speedMs * (0.7 + Math.random() * 0.6), signal);
    }
  }
}
