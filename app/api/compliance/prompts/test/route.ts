import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createOpenAIChatCompletion } from "@/lib/openai-fetch";

export async function POST(req: Request) {
  try {
    await requirePermission("PROMPT_MANAGE");
    const { promptType, systemPrompt, testInput, temperature = 0.1 } = await req.json();

    if (!systemPrompt || !testInput) {
      return NextResponse.json(
        { error: "Both systemPrompt and testInput are required for testing." },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    const completion = await createOpenAIChatCompletion({
      model: "gpt-4o",
      temperature: Number(temperature) || 0.1,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: testInput,
        },
      ],
    });

    const executionTimeMs = Date.now() - startTime;
    const output = completion.choices[0]?.message?.content || "";

    return NextResponse.json({
      success: true,
      output,
      executionTimeMs,
      tokensUsed: completion.usage?.total_tokens || 0,
      model: "gpt-4o",
    });
  } catch (error: any) {
    console.error("Prompt test execution failed:", error);
    return NextResponse.json(
      { error: error.message || "Prompt sandbox execution failed" },
      { status: 500 }
    );
  }
}
