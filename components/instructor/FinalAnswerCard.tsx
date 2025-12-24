import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// HTML 태그를 제거하고 순수 텍스트만 반환
function stripHtml(html: string): string {
  if (!html) return "";
  // 간단한 HTML 태그 제거
  return html.replace(/<[^>]*>/g, "");
}

// 텍스트를 HTML로 변환 (줄바꿈 처리)
function textToHtml(text: string): string {
  if (!text) return "";
  // HTML 특수문자 이스케이프
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>"); // 줄바꿈을 <br>로 변환
}

// 답안에서 복사-붙여넣기한 부분을 하이라이트
function highlightPastedContent(answer: string, pasteLogs: PasteLog[]): string {
  if (!answer) return "";

  // 답안이 HTML인지 텍스트인지 확인
  const isHtml = /<[^>]+>/.test(answer);

  // HTML이 아닌 경우 (textarea로 변경 후) - 텍스트를 HTML로 변환
  if (!isHtml) {
    // 먼저 텍스트를 HTML로 변환 (줄바꿈 처리)
    let htmlAnswer = textToHtml(answer);

    // 붙여넣기가 있으면 하이라이트 적용
    if (pasteLogs && pasteLogs.length > 0) {
      // 디버깅: 로그 확인
      console.log(
        "[FinalAnswerCard] Paste logs:",
        pasteLogs.map((log) => ({
          id: log.id,
          is_internal: log.is_internal,
          suspicious: log.suspicious,
          pasted_text_length: log.pasted_text?.length,
        }))
      );

      // 내부 복사 - 파란색 (먼저 필터링하여 외부 복사와 구분)
      const internalPastes = pasteLogs.filter(
        (log) => log.is_internal === true && log.pasted_text
      );

      // 외부 복사 (의심스러운 붙여넣기) - 빨간색 (내부 복사가 아닌 것만)
      const externalPastes = pasteLogs.filter(
        (log) => log.is_internal !== true && log.suspicious && log.pasted_text
      );

      console.log(
        "[FinalAnswerCard] Internal:",
        internalPastes.length,
        "External:",
        externalPastes.length
      );

      // 내부 복사 하이라이트 (파란색) - 외부 복사와 동일한 로직, 색상만 다름
      for (const log of internalPastes) {
        const pastedText = log.pasted_text!;
        const escapedText = textToHtml(pastedText);
        // 이미 하이라이트되지 않은 부분만 매칭
        const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
        const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

        // 각 부분에서 내부 복사 텍스트 찾기
        let newHtmlAnswer = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const regex = new RegExp(
            escapedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g"
          );
          const highlightedPart = part.replace(
            regex,
            `<mark class="bg-blue-200 text-blue-900 font-semibold px-1 rounded">${escapedText}</mark>`
          );
          newHtmlAnswer += highlightedPart;
          if (i < markers.length) {
            newHtmlAnswer += markers[i];
          }
        }
        htmlAnswer = newHtmlAnswer;
      }

      // 외부 복사 하이라이트 (빨간색) - 내부 복사와 동일한 로직, 색상만 다름
      for (const log of externalPastes) {
        const pastedText = log.pasted_text!;
        const escapedText = textToHtml(pastedText);
        // 이미 하이라이트되지 않은 부분만 매칭
        const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
        const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

        // 각 부분에서 외부 복사 텍스트 찾기
        let newHtmlAnswer = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const regex = new RegExp(
            escapedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "g"
          );
          const highlightedPart = part.replace(
            regex,
            `<mark class="bg-red-200 text-red-900 font-semibold px-1 rounded">${escapedText}</mark>`
          );
          newHtmlAnswer += highlightedPart;
          if (i < markers.length) {
            newHtmlAnswer += markers[i];
          }
        }
        htmlAnswer = newHtmlAnswer;
      }
    }

    return htmlAnswer;
  }

  // HTML인 경우 (기존 데이터 호환성)
  if (!pasteLogs || pasteLogs.length === 0) return answer;

  // 내부 복사 - 파란색 (먼저 필터링하여 외부 복사와 구분)
  const internalPastes = pasteLogs.filter(
    (log) => log.is_internal === true && log.pasted_text
  );

  // 외부 복사 (의심스러운 붙여넣기) - 빨간색 (내부 복사가 아닌 것만)
  const externalPastes = pasteLogs.filter(
    (log) => log.is_internal !== true && log.suspicious && log.pasted_text
  );

  if (externalPastes.length === 0 && internalPastes.length === 0) return answer;

  let highlightedAnswer = answer;
  const textBeforeHighlight = stripHtml(highlightedAnswer);

  // 내부 복사 하이라이트 (파란색) - 외부 복사와 동일한 로직, 색상만 다름
  for (const log of internalPastes) {
    if (!log.pasted_text) continue;

    // 이미 하이라이트되지 않은 부분만 매칭
    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

    // 각 부분에서 내부 복사 텍스트 찾기
    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const regex = new RegExp(
        `(${log.pasted_text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "g"
      );
      const highlightedPart = part.replace(
        regex,
        `<mark class="bg-blue-200 text-blue-900 font-semibold px-1 rounded">$1</mark>`
      );
      newHighlightedAnswer += highlightedPart;
      if (i < markers.length) {
        newHighlightedAnswer += markers[i];
      }
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  // 외부 복사 하이라이트 (빨간색) - 내부 복사와 동일한 로직, 색상만 다름
  for (const log of externalPastes) {
    if (!log.pasted_text) continue;

    // 이미 하이라이트되지 않은 부분만 매칭
    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];

    // 각 부분에서 외부 복사 텍스트 찾기
    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const regex = new RegExp(
        `(${log.pasted_text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "g"
      );
      const highlightedPart = part.replace(
        regex,
        `<mark class="bg-red-200 text-red-900 font-semibold px-1 rounded">$1</mark>`
      );
      newHighlightedAnswer += highlightedPart;
      if (i < markers.length) {
        newHighlightedAnswer += markers[i];
      }
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  return highlightedAnswer;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
  ai_feedback?: Record<string, unknown>;
  student_reply?: string;
}

interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  pasted_text?: string;
  paste_start?: number;
  paste_end?: number;
  answer_length_before?: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

interface FinalAnswerCardProps {
  submission: Submission | undefined;
  pasteLogs?: PasteLog[];
  questionId?: string;
}

export function FinalAnswerCard({
  submission,
  pasteLogs,
  questionId,
}: FinalAnswerCardProps) {
  // 현재 문제에 해당하는 로그만 필터링
  const relevantLogs =
    pasteLogs?.filter((log) => !questionId || log.question_id === questionId) ||
    [];
  const suspiciousLogs = relevantLogs.filter(
    (log) => log.is_internal !== true && log.suspicious
  );
  const internalLogs = relevantLogs.filter((log) => log.is_internal === true);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-600" />
            <CardTitle>최종 답안</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {suspiciousLogs.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                외부 붙여넣기 {suspiciousLogs.length}건
              </Badge>
            )}
            {internalLogs.length > 0 && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-blue-100 text-blue-900 hover:bg-blue-200"
              >
                <FileText className="w-3 h-3" />
                내부 복사 {internalLogs.length}건
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>학생이 제출한 최종 답안입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {submission ? (
          <div className="space-y-3">
            {suspiciousLogs.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      부정행위 의심 활동 감지
                    </p>
                    <div className="text-xs text-red-700 space-y-1">
                      {suspiciousLogs.map((log) => (
                        <p key={log.id}>
                          • {log.length.toLocaleString()}자 외부 붙여넣기 (
                          {new Date(log.timestamp).toLocaleString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                          )
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {internalLogs.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800 mb-1">
                      내부 복사 활동
                    </p>
                    <div className="text-xs text-blue-700 space-y-1">
                      {internalLogs.map((log) => (
                        <p key={log.id}>
                          • {log.length.toLocaleString()}자 내부 복사 (
                          {new Date(log.timestamp).toLocaleString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                          )
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4">
              <div
                className="text-sm prose max-w-none whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{
                  __html:
                    highlightPastedContent(
                      submission.answer || "",
                      relevantLogs
                    ) || textToHtml("답안이 없습니다."),
                }}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>제출된 답안이 없습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
