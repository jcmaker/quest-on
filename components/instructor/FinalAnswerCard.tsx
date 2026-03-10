import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

// 기존 DB에 저장된 ...[truncated] suffix 제거
function cleanPastedText(text: string): string {
  return text.replace(/\.\.\.\[truncated\]$/, "");
}

// position 기반 하이라이트 fallback: paste_start/paste_end로 답안에서 직접 추출
function applyPositionHighlight(
  htmlAnswer: string,
  answer: string,
  log: PasteLog,
  colorClass: string
): string {
  if (
    log.paste_start == null ||
    log.paste_end == null ||
    log.paste_start >= log.paste_end ||
    log.paste_end > answer.length
  )
    return htmlAnswer;

  const segment = answer.substring(log.paste_start, log.paste_end);
  const escapedSegment = textToHtml(segment);
  const regex = new RegExp(
    escapedSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );

  const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
  const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].replace(
      regex,
      `<mark class="${colorClass}">${escapedSegment}</mark>`
    );
    if (i < markers.length) result += markers[i];
  }
  return result;
}

// regex 기반 하이라이트 (기존 로직)
function applyTextHighlight(
  htmlAnswer: string,
  pastedText: string,
  colorClass: string
): string {
  const escapedText = textToHtml(pastedText);
  const regex = new RegExp(
    escapedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );

  const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
  const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].replace(
      regex,
      `<mark class="${colorClass}">${escapedText}</mark>`
    );
    if (i < markers.length) result += markers[i];
  }
  return result;
}

// 답안에서 복사-붙여넣기한 부분을 하이라이트
function highlightPastedContent(answer: string, pasteLogs: PasteLog[]): string {
  if (!answer) return "";

  const BLUE_CLASS = "bg-blue-200 text-blue-900 font-semibold px-1 rounded";
  const RED_CLASS = "bg-red-200 text-red-900 font-semibold px-1 rounded";

  // 답안이 HTML인지 텍스트인지 확인
  const isHtml = /<[^>]+>/.test(answer);

  // HTML이 아닌 경우 (textarea로 변경 후) - 텍스트를 HTML로 변환
  if (!isHtml) {
    let htmlAnswer = textToHtml(answer);

    if (pasteLogs && pasteLogs.length > 0) {
      const internalPastes = pasteLogs.filter(
        (log) => log.is_internal === true && log.pasted_text
      );
      const externalPastes = pasteLogs.filter(
        (log) => log.is_internal !== true && log.suspicious && log.pasted_text
      );

      // 내부 복사 하이라이트 (파란색)
      for (const log of internalPastes) {
        const pastedText = cleanPastedText(log.pasted_text!);
        const before = htmlAnswer;
        htmlAnswer = applyTextHighlight(htmlAnswer, pastedText, BLUE_CLASS);
        // regex 매칭 실패 시 position fallback
        if (htmlAnswer === before) {
          htmlAnswer = applyPositionHighlight(htmlAnswer, answer, log, BLUE_CLASS);
        }
      }

      // 외부 복사 하이라이트 (빨간색)
      for (const log of externalPastes) {
        const pastedText = cleanPastedText(log.pasted_text!);
        const before = htmlAnswer;
        htmlAnswer = applyTextHighlight(htmlAnswer, pastedText, RED_CLASS);
        // regex 매칭 실패 시 position fallback
        if (htmlAnswer === before) {
          htmlAnswer = applyPositionHighlight(htmlAnswer, answer, log, RED_CLASS);
        }
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

  const BLUE_CLASS_HTML = "bg-blue-200 text-blue-900 font-semibold px-1 rounded";
  const RED_CLASS_HTML = "bg-red-200 text-red-900 font-semibold px-1 rounded";

  let highlightedAnswer = answer;

  // 내부 복사 하이라이트 (파란색)
  for (const log of internalPastes) {
    if (!log.pasted_text) continue;
    const pastedText = cleanPastedText(log.pasted_text);

    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
    const regex = new RegExp(
      `(${pastedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "g"
    );

    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      newHighlightedAnswer += parts[i].replace(
        regex,
        `<mark class="${BLUE_CLASS_HTML}">$1</mark>`
      );
      if (i < markers.length) newHighlightedAnswer += markers[i];
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  // 외부 복사 하이라이트 (빨간색)
  for (const log of externalPastes) {
    if (!log.pasted_text) continue;
    const pastedText = cleanPastedText(log.pasted_text);

    const parts = highlightedAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
    const markers = highlightedAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
    const regex = new RegExp(
      `(${pastedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "g"
    );

    let newHighlightedAnswer = "";
    for (let i = 0; i < parts.length; i++) {
      newHighlightedAnswer += parts[i].replace(
        regex,
        `<mark class="${RED_CLASS_HTML}">$1</mark>`
      );
      if (i < markers.length) newHighlightedAnswer += markers[i];
    }
    highlightedAnswer = newHighlightedAnswer;
  }

  return highlightedAnswer;
}

interface Submission {
  id: string;
  q_idx: number;
  answer: string;
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
