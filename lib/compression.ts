import LZString from "lz-string";

export interface CompressionMetadata {
  algorithm: string;
  version: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timestamp: string;
}

export interface CompressedData {
  data: string;
  metadata: CompressionMetadata;
}

/**
 * Compress data using LZ-String algorithm with Base64 encoding for safe storage
 * @param data - The data to compress (string or object)
 * @returns Compressed data with metadata
 */
export function compressData(data: unknown): CompressedData {
  const originalString = typeof data === "string" ? data : JSON.stringify(data);
  const originalSize = new Blob([originalString]).size;

  // Compress using LZ-String and encode with Base64 for safe JSON storage
  const compressed = LZString.compressToBase64(originalString);

  if (!compressed) {
    throw new Error("Failed to compress data");
  }

  const compressedSize = new Blob([compressed]).size;
  const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 0;

  const metadata: CompressionMetadata = {
    algorithm: "lz-string-base64",
    version: "1.0.0",
    originalSize,
    compressedSize,
    compressionRatio,
    timestamp: new Date().toISOString(),
  };

  return {
    data: compressed,
    metadata,
  };
}

/**
 * Decompress data using LZ-String algorithm with Base64 decoding
 * @param compressedData - The compressed data string
 * @returns Decompressed data
 */
export function decompressData(compressedData: string): unknown {
  if (!compressedData) {
    throw new Error("No compressed data provided");
  }

  // Try Base64 decompression first (new format)
  let decompressed = LZString.decompressFromBase64(compressedData);

  // Fallback to regular decompression (legacy format)
  if (!decompressed) {
    decompressed = LZString.decompress(compressedData);
  }

  if (!decompressed) {
    throw new Error("Failed to decompress data");
  }

  // Try to parse as JSON, fallback to string
  try {
    return JSON.parse(decompressed);
  } catch {
    return decompressed;
  }
}

/**
 * Compress exam submission data (chat history, answers, feedback, etc.)
 * @param submissionData - The complete exam submission data
 * @returns Compressed submission data
 */
export function compressExamSubmissionData(submissionData: {
  chatHistory?: unknown[];
  answers?: unknown[];
  feedback?: string;
  feedbackResponses?: unknown[];
}): {
  compressedChatData?: CompressedData;
  compressedAnswers?: CompressedData;
  compressedFeedback?: CompressedData;
  compressedFeedbackResponses?: CompressedData;
  compressionMetadata: CompressionMetadata;
} {
  const result: Record<string, unknown> = {};
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  // Compress chat history
  if (submissionData.chatHistory && submissionData.chatHistory.length > 0) {
    const compressedChatData = compressData(submissionData.chatHistory);
    result.compressedChatData = compressedChatData;
    totalOriginalSize += compressedChatData.metadata.originalSize;
    totalCompressedSize += compressedChatData.metadata.compressedSize;
  }

  // Compress answers
  if (submissionData.answers && submissionData.answers.length > 0) {
    const compressedAnswers = compressData(submissionData.answers);
    result.compressedAnswers = compressedAnswers;
    totalOriginalSize += compressedAnswers.metadata.originalSize;
    totalCompressedSize += compressedAnswers.metadata.compressedSize;
  }

  // Compress feedback
  if (submissionData.feedback) {
    const compressedFeedback = compressData(submissionData.feedback);
    result.compressedFeedback = compressedFeedback;
    totalOriginalSize += compressedFeedback.metadata.originalSize;
    totalCompressedSize += compressedFeedback.metadata.compressedSize;
  }

  // Compress feedback responses
  if (
    submissionData.feedbackResponses &&
    submissionData.feedbackResponses.length > 0
  ) {
    result.compressedFeedbackResponses = compressData(
      submissionData.feedbackResponses
    ) as CompressedData;
    const compressedFeedbackResponses =
      result.compressedFeedbackResponses as CompressedData;
    totalOriginalSize += compressedFeedbackResponses.metadata.originalSize;
    totalCompressedSize += compressedFeedbackResponses.metadata.compressedSize;
  }

  // Create overall compression metadata
  result.compressionMetadata = {
    algorithm: "lz-string-base64",
    version: "1.0.0",
    originalSize: totalOriginalSize,
    compressedSize: totalCompressedSize,
    compressionRatio:
      totalOriginalSize > 0 ? totalCompressedSize / totalOriginalSize : 0,
    timestamp: new Date().toISOString(),
  };

  return {
    compressedChatData: result.compressedChatData as CompressedData,
    compressedAnswers: result.compressedAnswers as CompressedData,
    compressedFeedback: result.compressedFeedback as CompressedData,
    compressedFeedbackResponses:
      result.compressedFeedbackResponses as CompressedData,
    compressionMetadata: result.compressionMetadata as CompressionMetadata,
  };
}

/**
 * Decompress exam submission data
 * @param compressedSubmissionData - The compressed submission data from database
 * @returns Decompressed submission data
 */
export function decompressExamSubmissionData(compressedSubmissionData: {
  compressed_chat_data?: string;
  compressed_answers?: string;
  compressed_feedback?: string;
  compressed_feedback_responses?: string;
}): {
  chatHistory?: unknown[];
  answers?: unknown[];
  feedback?: string;
  feedbackResponses?: unknown[];
} {
  const result: Record<string, unknown> = {};

  if (compressedSubmissionData.compressed_chat_data) {
    result.chatHistory = decompressData(
      compressedSubmissionData.compressed_chat_data
    );
  }

  if (compressedSubmissionData.compressed_answers) {
    result.answers = decompressData(
      compressedSubmissionData.compressed_answers
    );
  }

  if (compressedSubmissionData.compressed_feedback) {
    result.feedback = decompressData(
      compressedSubmissionData.compressed_feedback
    );
  }

  if (compressedSubmissionData.compressed_feedback_responses) {
    result.feedbackResponses = decompressData(
      compressedSubmissionData.compressed_feedback_responses
    );
  }

  return result;
}
