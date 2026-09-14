import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractSourceText } from "@/lib/source-extraction";

export async function POST(
  _req: Request,
  props: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await props.params;
  const source = await db.caseSource.findUnique({ where: { id: sourceId } });
  if (!source) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  if (source.sourceType === "VIDEO") {
    return NextResponse.json({ error: "Video extraction requires a configured video-to-audio provider." }, { status: 501 });
  }

  await db.caseSource.update({ where: { id: sourceId }, data: { status: "PROCESSING", processingError: null } });

  try {
    const response = await fetch(source.storageUrl);
    if (!response.ok) throw new Error(`Unable to download source file (${response.status}).`);
    const extractedText = await extractSourceText(Buffer.from(await response.arrayBuffer()), source.fileName, source.mimeType);
    if (!extractedText) throw new Error("No text could be extracted from this document.");

    const updated = await db.caseSource.update({
      where: { id: sourceId },
      data: { status: "READY", extractedText },
    });
    await db.case.update({ where: { id: source.caseId }, data: { rawInput: extractedText } });
    return NextResponse.json({ success: true, source: updated, extractedText });
  } catch (error: any) {
    const message = error.message || "Document extraction failed.";
    const failed = await db.caseSource.update({ where: { id: sourceId }, data: { status: "FAILED", processingError: message } });
    return NextResponse.json({ error: message, source: failed }, { status: 422 });
  }
}
