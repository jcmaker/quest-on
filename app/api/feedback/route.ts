import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { examCode, answers, examId } = await request.json();

    if (!examCode || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TODO: Validate exam submission from Supabase
    // TODO: Check if student is authorized and exam is still active
    // TODO: Store submission in database

    // Prepare the feedback prompt
    const answersText = answers
      .map(
        (answer: { text?: string }, index: number) =>
          `Question ${index + 1}: ${answer.text || "No answer provided"}`
      )
      .join("\n\n");

    const systemPrompt = `You are an expert teacher providing comprehensive feedback on a student's exam submission. 
    
    Exam Code: ${examCode}
    
    Your task is to:
    1. Analyze each answer for understanding and accuracy
    2. Provide constructive feedback on what was done well
    3. Identify areas for improvement
    4. Give specific suggestions for learning
    5. Provide an overall assessment
    
    Format your response as HTML with:
    - A summary section at the top
    - Individual question feedback
    - Overall assessment and recommendations
    - Encouraging tone while being honest about areas for improvement
    
    Keep the feedback educational and actionable.`;

    const userPrompt = `Please provide detailed feedback on this exam submission:

${answersText}

Please analyze each answer and provide comprehensive feedback.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const feedback =
      completion.choices[0]?.message?.content ||
      "Unable to generate feedback at this time.";

    // TODO: Store feedback in Supabase
    // TODO: Calculate and store score if applicable
    // TODO: Send notification to instructor

    return NextResponse.json({
      feedback,
      timestamp: new Date().toISOString(),
      examCode,
      examId,
      status: "submitted",
    });
  } catch (error) {
    console.error("Feedback API error:", error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: "OpenAI API error", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
