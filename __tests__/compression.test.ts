import { describe, it, expect } from "vitest";
import {
  compressData,
  decompressData,
  compressExamSubmissionData,
  decompressExamSubmissionData,
} from "@/lib/compression";

describe("compressData / decompressData", () => {
  it("round-trips a simple string", () => {
    const original = "Hello, world!";
    const compressed = compressData(original);
    const result = decompressData(compressed.data);
    expect(result).toBe(original);
  });

  it("round-trips a JSON object", () => {
    const original = { name: "test", score: 95, nested: { a: [1, 2, 3] } };
    const compressed = compressData(original);
    const result = decompressData(compressed.data);
    expect(result).toEqual(original);
  });

  it("provides valid compression metadata", () => {
    const original = "a".repeat(1000);
    const compressed = compressData(original);

    expect(compressed.metadata.algorithm).toBe("lz-string-base64");
    expect(compressed.metadata.originalSize).toBeGreaterThan(0);
    expect(compressed.metadata.compressedSize).toBeGreaterThan(0);
    expect(compressed.metadata.compressionRatio).toBeLessThan(1); // Repeating 'a' should compress well
    expect(compressed.metadata.timestamp).toBeTruthy();
  });

  it("compresses data smaller than original for repetitive content", () => {
    const original = JSON.stringify(Array(100).fill({ answer: "test answer", score: 50 }));
    const compressed = compressData(original);
    expect(compressed.metadata.compressedSize).toBeLessThan(compressed.metadata.originalSize);
  });

  it("throws on empty compressed data", () => {
    expect(() => decompressData("")).toThrow("No compressed data provided");
  });

  it("throws on data that decompresses to null", () => {
    // LZ-String's decompress may return non-null for arbitrary strings,
    // but a single null byte causes both decompressFromBase64 and decompress to return null
    expect(() => decompressData("\u0000")).toThrow("Failed to decompress data");
  });

  it("round-trips unicode content", () => {
    const original = "한국어 테스트 🎯 이모지 포함";
    const compressed = compressData(original);
    const result = decompressData(compressed.data);
    expect(result).toBe(original);
  });

  it("round-trips empty array", () => {
    const original: unknown[] = [];
    const compressed = compressData(original);
    const result = decompressData(compressed.data);
    expect(result).toEqual(original);
  });
});

describe("compressExamSubmissionData / decompressExamSubmissionData", () => {
  it("round-trips complete submission data", () => {
    const submission = {
      chatHistory: [
        { role: "user", content: "질문입니다" },
        { role: "assistant", content: "답변입니다" },
      ],
      answers: [{ text: "학생 답안" }],
      feedback: "잘했습니다",
      feedbackResponses: [{ reply: "감사합니다" }],
    };

    const compressed = compressExamSubmissionData(submission);

    expect(compressed.compressionMetadata).toBeDefined();
    expect(compressed.compressionMetadata.originalSize).toBeGreaterThan(0);

    // Decompress each part
    if (compressed.compressedChatData) {
      const chatHistory = decompressData(compressed.compressedChatData.data);
      expect(chatHistory).toEqual(submission.chatHistory);
    }
    if (compressed.compressedAnswers) {
      const answers = decompressData(compressed.compressedAnswers.data);
      expect(answers).toEqual(submission.answers);
    }
  });

  it("handles empty submission data", () => {
    const compressed = compressExamSubmissionData({});
    expect(compressed.compressionMetadata.originalSize).toBe(0);
  });
});
