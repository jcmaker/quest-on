/**
 * OpenAI Responses API 파싱 유틸리티
 *
 * Responses API의 output 배열에서 텍스트를 추출합니다.
 */

import type {
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseOutputText,
} from "openai/resources/responses/responses";

/**
 * OpenAI Responses API의 output 배열에서 메시지 텍스트를 추출합니다.
 */
export function extractResponseText(output: ResponseOutputItem[]): string {
  if (!output || !Array.isArray(output)) return "";

  const messageOutput = output.find(
    (item: ResponseOutputItem): item is ResponseOutputMessage =>
      item.type === "message" && "content" in item
  );

  if (!messageOutput || !Array.isArray(messageOutput.content)) return "";

  return messageOutput.content
    .filter(
      (part): part is ResponseOutputText =>
        part.type === "output_text" && "text" in part
    )
    .map((part) => part.text)
    .join("");
}
