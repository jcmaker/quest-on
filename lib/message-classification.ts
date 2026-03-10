/**
 * 메시지 타입 분류 유틸리티
 *
 * 키워드 기반으로 메시지를 개념/계산/전략/기타로 분류합니다.
 */

export type MessageType = "concept" | "calculation" | "strategy" | "other";

export async function classifyMessageType(message: string): Promise<MessageType> {
  try {
    const lowerMessage = message.toLowerCase();

    // 계산 관련 키워드
    if (
      /\d+|\+|\-|\*|\/|계산|연산|공식|수식|값|결과/.test(lowerMessage) ||
      /how much|calculate|compute|solve|equation/.test(lowerMessage)
    ) {
      return "calculation";
    }

    // 전략/방법 관련 키워드
    if (
      /방법|전략|접근|절차|과정|어떻게|how to|way|method|strategy|approach/.test(
        lowerMessage
      )
    ) {
      return "strategy";
    }

    // 개념 관련 키워드
    if (
      /무엇|뭐|의미|정의|개념|이유|왜|what|meaning|definition|concept|why/.test(
        lowerMessage
      )
    ) {
      return "concept";
    }

    return "other";
  } catch {
    return "other";
  }
}
