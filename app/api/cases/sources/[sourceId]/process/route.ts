import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Source processing is not available in the Cloudflare Worker. Configure an external document/video processing worker for extraction and transcription.",
    },
    { status: 501 }
  );
}
