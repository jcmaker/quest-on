import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json();

    switch (action) {
      case "create_exam":
        return await createExam(data);
      case "update_exam":
        return await updateExam(data);
      case "submit_exam":
        return await submitExam(data);
      case "get_exam":
        return await getExam(data);
      case "get_instructor_exams":
        return await getInstructorExams();
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Supabase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function createExam(data: {
  title: string;
  code: string;
  description: string;
  duration: number;
  questions: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}) {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    // Create exam with the correct schema
    const examData = {
      title: data.title,
      code: data.code,
      description: data.description,
      duration: data.duration,
      questions: data.questions,
      status: data.status,
      instructor_id: user.id, // Clerk user ID (e.g., "user_31ihNg56wMaE27ft10H4eApjc1J")
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    const { data: exam, error } = await supabase
      .from("exams")
      .insert([examData])
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Create exam error:", error);
    return NextResponse.json(
      {
        error: `Failed to create exam: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}

async function updateExam(data: {
  id: string;
  update: Record<string, unknown>;
}) {
  try {
    const { data: exam, error } = await supabase
      .from("exams")
      .update(data.update)
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Update exam error:", error);
    return NextResponse.json(
      { error: "Failed to update exam" },
      { status: 500 }
    );
  }
}

async function submitExam(data: {
  examId: string;
  studentId: string;
  answers: unknown[];
}) {
  try {
    // Store exam submission
    const { data: submission, error: submissionError } = await supabase
      .from("exam_submissions")
      .insert([
        {
          exam_id: data.examId,
          student_id: data.studentId,
          answers: data.answers,
          submitted_at: new Date().toISOString(),
          status: "submitted",
        },
      ])
      .select()
      .single();

    if (submissionError) throw submissionError;

    // Update exam status if needed
    // Add any other necessary database operations

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Submit exam error:", error);
    return NextResponse.json(
      { error: "Failed to submit exam" },
      { status: 500 }
    );
  }
}

async function getExam(data: { code: string }) {
  try {
    const { data: exam, error } = await supabase
      .from("exams")
      .select("*")
      .eq("code", data.code)
      .single();

    if (error) throw error;

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("Get exam error:", error);
    return NextResponse.json({ error: "Failed to get exam" }, { status: 500 });
  }
}

async function getInstructorExams() {
  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const { data: exams, error } = await supabase
      .from("exams")
      .select("*")
      .eq("instructor_id", user.id) // Clerk user ID
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ exams });
  } catch (error) {
    console.error("Get instructor exams error:", error);
    return NextResponse.json({ error: "Failed to get exams" }, { status: 500 });
  }
}
