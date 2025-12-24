# TipTap vs 일반 textarea: 하이라이트 구현 비교

## 현재 상황: TipTap 에디터 사용

현재 `SimpleRichTextEditor`는 TipTap (ProseMirror 기반)을 사용하고 있습니다.

## 일반 textarea를 사용한다면?

### ✅ 장점: 훨씬 간단해짐!

#### 1. **커서 위치 추적이 매우 쉬움**

```typescript
// 일반 textarea
const handlePaste = (e: ClipboardEvent) => {
  const textarea = e.target as HTMLTextAreaElement;
  const pastedText = e.clipboardData?.getData("text/plain");
  
  // 정확한 커서 위치를 바로 알 수 있음!
  const cursorPosition = textarea.selectionStart;
  const answerLengthBefore = textarea.value.length;
  
  // 붙여넣기 후 위치도 정확히 알 수 있음
  const answerLengthAfter = textarea.value.length + pastedText.length;
  const pasteStart = cursorPosition;
  const pasteEnd = cursorPosition + pastedText.length;
  
  // 서버로 전송
  await fetch("/api/log/paste", {
    method: "POST",
    body: JSON.stringify({
      pasted_text: pastedText,
      paste_start: pasteStart,        // 정확한 시작 위치!
      paste_end: pasteEnd,            // 정확한 끝 위치!
      answer_length_before: answerLengthBefore,
      answer_text_before: textarea.value.substring(0, cursorPosition), // 선택사항
    }),
  });
};
```

#### 2. **하이라이트 구현이 매우 간단**

```typescript
// 답안에서 하이라이트
function highlightPastedContent(
  answer: string,  // 순수 텍스트
  pasteLogs: PasteLog[]
): string {
  if (!answer || pasteLogs.length === 0) return answer;

  const suspiciousPastes = pasteLogs
    .filter((log) => log.suspicious && log.paste_start !== null)
    .sort((a, b) => a.paste_start! - b.paste_start!);

  if (suspiciousPastes.length === 0) return answer;

  // 역순으로 처리 (뒤에서부터 하이라이트하면 인덱스가 안 밀림)
  let highlightedAnswer = answer;
  
  for (let i = suspiciousPastes.length - 1; i >= 0; i--) {
    const log = suspiciousPastes[i];
    const start = log.paste_start!;
    const end = log.paste_end!;
    
    // 하이라이트 태그 삽입
    const before = highlightedAnswer.substring(0, start);
    const pasted = highlightedAnswer.substring(start, end);
    const after = highlightedAnswer.substring(end);
    
    highlightedAnswer = `${before}<mark class="bg-red-200">${pasted}</mark>${after}`;
  }

  return highlightedAnswer;
}
```

#### 3. **데이터베이스 스키마도 간단**

```sql
ALTER TABLE paste_logs 
ADD COLUMN pasted_text TEXT,
ADD COLUMN paste_start INTEGER,  -- 답안 내 시작 위치
ADD COLUMN paste_end INTEGER;    -- 답안 내 끝 위치
```

### ❌ TipTap 에디터의 복잡성

#### 1. **HTML 구조로 인한 복잡성**

```typescript
// TipTap 에디터
const handlePaste = (e: ClipboardEvent, editor: Editor) => {
  const pastedText = e.clipboardData?.getData("text/plain");
  
  // HTML 구조로 인해 텍스트 위치 계산이 복잡
  const htmlContent = editor.getHTML();  // HTML 문자열
  const textContent = editor.getText();   // 순수 텍스트
  
  // ProseMirror의 selection은 HTML 구조를 고려해야 함
  const { from, to } = editor.state.selection;
  
  // 하지만 HTML과 텍스트 간 인덱스 매핑이 복잡함
  // 예: <p>안녕</p> -> 텍스트는 "안녕"이지만 HTML은 더 길음
};
```

#### 2. **하이라이트 구현이 복잡**

```typescript
// TipTap에서 하이라이트하려면
function highlightPastedContent(
  htmlAnswer: string,  // HTML 형식
  pasteLogs: PasteLog[]
): string {
  // 1. HTML을 파싱
  // 2. 텍스트 위치를 HTML 위치로 변환
  // 3. HTML 구조를 유지하면서 하이라이트 태그 삽입
  // 4. 매우 복잡한 로직 필요...
}
```

## 비교표

| 항목 | 일반 textarea | TipTap 에디터 |
|------|--------------|---------------|
| **커서 위치 추적** | ✅ `selectionStart/End`로 즉시 가능 | ❌ ProseMirror selection 변환 필요 |
| **텍스트 위치 계산** | ✅ 매우 간단 (인덱스 직접 사용) | ❌ HTML ↔ 텍스트 변환 필요 |
| **하이라이트 구현** | ✅ 간단한 문자열 조작 | ❌ HTML 파싱 및 구조 유지 필요 |
| **데이터 저장** | ✅ 위치 정보만 저장 | ❌ HTML 스냅샷 또는 복잡한 매핑 필요 |
| **구현 시간** | ⏱️ 1-2시간 | ⏱️ 4-6시간 |
| **정확도** | ✅ 매우 높음 | ⚠️ 중간 (HTML 구조 영향) |

## 결론

### 일반 textarea를 사용한다면:
- ✅ **구현이 훨씬 간단함** (1-2시간)
- ✅ **정확도가 매우 높음**
- ✅ **데이터 저장도 간단**
- ✅ **하이라이트 로직이 직관적**

### TipTap 에디터를 유지한다면:
- ❌ **구현이 복잡함** (4-6시간)
- ⚠️ **정확도가 상대적으로 낮음** (HTML 구조 영향)
- ❌ **더 많은 데이터 저장 필요**

## 추천

**하이라이트 기능이 중요하다면:**
- 답안 작성란을 일반 `textarea`로 변경하는 것을 고려
- 또는 TipTap 에디터를 유지하되, 하이라이트는 **순수 텍스트 모드**로 표시

**TipTap 에디터를 유지하면서 하이라이트하려면:**
- `pasted_text`와 `answer_length_before`만 저장
- 답안 표시 시 **텍스트 모드**로 변환하여 하이라이트
- 정확도는 낮지만 구현은 가능

