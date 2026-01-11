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

// Helper function to get user info from Clerk
async function getUserInfo(clerkUserId: string): Promise<{
  name: string;
  email: string;
} | null> {
  try {
    const user = await clerk.users.getUser(clerkUserId);
    
    let name = "";
    if (user.firstName && user.lastName) {
      name = `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      name = user.firstName;
    } else if (user.lastName) {
      name = user.lastName;
    } else if (user.fullName) {
      name = user.fullName;
    } else {
      name = user.emailAddresses[0]?.emailAddress || `Student ${clerkUserId.slice(0, 8)}`;
    }
    
    const email = user.emailAddresses[0]?.emailAddress || `${clerkUserId}@example.com`;
    
    return { name, email };
  } catch (error) {
    console.error("Error fetching user info from Clerk:", error);
    return {
      name: `Student ${clerkUserId.slice(0, 8)}`,
      email: `${clerkUserId}@example.com`,
    };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get("since"); // ISO timestamp to get messages after this time
    
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get exam to verify instructor owns it
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, instructor_id")
      .eq("id", examId)
      .single();

    if (examError || !exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Check if instructor owns the exam
    if (exam.instructor_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all active sessions for this exam (not submitted)
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, student_id, created_at")
      .eq("exam_id", examId)
      .is("submitted_at", null);

    if (sessionsError) {
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ messages: [], sessions: [] });
    }

    // Get session IDs
    const sessionIds = sessions.map((s) => s.id);

    // Build query for messages
    let messagesQuery = supabase
      .from("messages")
      .select(
        `
        id,
        session_id,
        q_idx,
        role,
        content,
        compressed_content,
        compression_metadata,
        created_at
      `
      )
      .in("session_id", sessionIds)
      .in("role", ["user", "ai"]) // Include both user questions and AI responses
      .order("created_at", { ascending: false })
      .limit(100); // Limit to latest 100 messages (increased to include pairs)

    // If since parameter is provided, only get messages after that time
    if (since) {
      messagesQuery = messagesQuery.gt("created_at", since);
    }

    const { data: messages, error: messagesError } = await messagesQuery;

    if (messagesError) {
      throw messagesError;
    }

    // Get unique student IDs
    const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))];
    
    // Fetch student profiles from database
    const { data: studentProfiles } = await supabase
      .from("student_profiles")
      .select("student_id, name, student_number, school")
      .in("student_id", uniqueStudentIds);
    
    // Create a map of student profiles
    const studentProfileMap = new Map<string, { name: string; student_number: string; school: string }>();
    if (studentProfiles) {
      studentProfiles.forEach((profile) => {
        studentProfileMap.set(profile.student_id, {
          name: profile.name,
          student_number: profile.student_number,
          school: profile.school,
        });
      });
    }

    // Fetch student info for all students in parallel
    const studentInfoMap = new Map<string, { name: string; email: string; student_number?: string; school?: string }>();
    await Promise.all(
      uniqueStudentIds.map(async (studentId) => {
        const info = await getUserInfo(studentId);
        const profile = studentProfileMap.get(studentId);
        
        if (info) {
          studentInfoMap.set(studentId, {
            name: profile?.name || info.name,
            email: info.email,
            student_number: profile?.student_number,
            school: profile?.school,
          });
        }
      })
    );

    // Process messages with student info
    const processedMessages = (messages || []).map((message) => {
      // Find session to get student_id
      const session = sessions.find((s) => s.id === message.session_id);
      const studentId = session?.student_id || "";
      const studentInfo = studentInfoMap.get(studentId) || {
        name: `Student ${studentId.slice(0, 8)}`,
        email: `${studentId}@example.com`,
      };

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
        session_id: message.session_id,
        q_idx: message.q_idx,
        role: message.role, // Include role: "user" or "ai"
        content: content.substring(0, 500), // Truncate for preview
        created_at: message.created_at,
        student: {
          id: studentId,
          name: studentInfo.name,
          email: studentInfo.email,
          student_number: studentInfo.student_number,
          school: studentInfo.school,
        },
      };
    });

    // Sort by created_at descending (newest first)
    processedMessages.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
