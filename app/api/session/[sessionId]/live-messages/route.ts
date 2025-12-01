import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decompressData } from "@/lib/compression";
import { currentUser } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/nextjs/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Clerk client
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since"); // ISO timestamp

    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get session to verify it exists and get exam_id
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, exam_id, student_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, instructor_id")
      .eq("id", session.exam_id)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get student profile
    const { data: studentProfile } = await supabase
      .from("student_profiles")
      .select("name, student_number, school")
      .eq("student_id", session.student_id)
      .single();

    // Get student info from Clerk
    let studentName = `Student ${session.student_id.slice(0, 8)}`;
    try {
      const clerkUser = await clerk.users.getUser(session.student_id);
      if (clerkUser.firstName || clerkUser.lastName) {
        studentName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim();
      } else if (clerkUser.fullName) {
        studentName = clerkUser.fullName;
      }
    } catch (error) {
      console.error("Error fetching student info:", error);
    }

    // Build query for messages
    let messagesQuery = supabase
      .from("messages")
      .select("id, q_idx, role, content, compressed_content, created_at")
      .eq("session_id", sessionId)
      .eq("role", "user") // Only user messages
      .order("created_at", { ascending: false })
      .limit(50);

    // If since parameter is provided, only get messages after that time
    if (since) {
      messagesQuery = messagesQuery.gt("created_at", since);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      throw messagesError;
    }

    // Process messages
    const processedMessages = (messages || []).map((message) => {
      // Decompress content if needed
      let content = message.content;
      if (message.compressed_content && typeof message.compressed_content === "string") {
        try {
          const decompressed = decompressData(message.compressed_content);
          content = typeof decompressed === "string" ? decompressed : content;
        } catch (error) {
          console.error("Error decompressing message content:", error);
        }
      }

      return {
        id: message.id,
        session_id: sessionId,
        q_idx: message.q_idx,
        content: content.substring(0, 500),
        created_at: message.created_at,
        student: {
          id: session.student_id,
          name: studentProfile?.name || studentName,
          email: "",
          student_number: studentProfile?.student_number,
          school: studentProfile?.school,
        },
      };
    });

    return NextResponse.json({
      messages: processedMessages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching live messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
