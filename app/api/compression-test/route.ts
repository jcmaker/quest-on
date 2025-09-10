import { NextRequest, NextResponse } from "next/server";
import { compressData, decompressData } from "@/lib/compression";

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      case "compress":
        const compressed = compressData(data);
        return NextResponse.json({
          success: true,
          compressed: compressed.data,
          metadata: compressed.metadata,
        });

      case "decompress":
        const decompressed = decompressData(data);
        return NextResponse.json({
          success: true,
          decompressed,
        });

      case "compress-session-data":
        const sessionData = {
          chatHistory: data.chatHistory || [],
          answers: data.answers || [],
          feedback: data.feedback || "",
          feedbackResponses: data.feedbackResponses || [],
        };
        const compressedSession = compressData(sessionData);
        return NextResponse.json({
          success: true,
          compressed: compressedSession.data,
          metadata: compressedSession.metadata,
        });

      case "compress-message":
        const messageData = {
          content: data.content || "",
          timestamp: new Date().toISOString(),
        };
        const compressedMessage = compressData(messageData);
        return NextResponse.json({
          success: true,
          compressed: compressedMessage.data,
          metadata: compressedMessage.metadata,
        });

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: compress, decompress, compress-session-data, compress-message",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Compression test error:", error);
    return NextResponse.json(
      {
        error: "Compression test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Compression Test API",
    availableActions: [
      "compress",
      "decompress",
      "compress-session-data",
      "compress-message",
    ],
    example: {
      action: "compress",
      data: "Hello, this is a test string for compression!",
    },
  });
}
