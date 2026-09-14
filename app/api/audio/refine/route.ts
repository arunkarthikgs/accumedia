import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refineClinicalText } from "@/lib/clinical-refiner";

export async function POST(req: Request) {
  try {
    const { recordingId, textToRefine } = await req.json();

    if (!recordingId) {
      return NextResponse.json(
        { error: "recordingId is required to attach refinement results." },
        { status: 400 }
      );
    }

    if (!textToRefine || !textToRefine.trim()) {
      return NextResponse.json(
        { error: "textToRefine payload is required." },
        { status: 400 }
      );
    }

    // Mark DB status as REFINING
    await db.audioRecording.update({
      where: { id: recordingId },
      data: {
        transcriptionStatus: "REFINING",
      },
    });

    // Run Stage 2: LLM Clinical Refinement (GPT-4o)
    const refinedText = await refineClinicalText(textToRefine.trim());

    // Update DB with final refined text and status
    const updated = await db.audioRecording.update({
      where: { id: recordingId },
      data: {
        transcribedText: refinedText,
        transcriptionStatus: "REFINED",
        refinerAgent: "gpt-4o",
      },
    });

    return NextResponse.json({
      success: true,
      recordingId: updated.id,
      transcribedText: refinedText,
      transcriptionStatus: updated.transcriptionStatus,
    });
  } catch (error: any) {
    console.error("Refinement step failure:", error);
    return NextResponse.json(
      { error: error.message || "Failed during clinical text refinement." },
      { status: 500 }
    );
  }
}
