import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const kase = await db.case.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        rawInput: true,
        guidedSubmission: true,
        masterRecord: true,
        safetyAudit: true,
        physician: { select: { name: true, specialty: true } },
        organization: { select: { name: true, id: true } },
        recordings: { select: { rawTranscript: true, transcribedText: true, transcriptionAgent: true } },
        safetyFlags: { where: { status: "OPEN" }, select: { id: true, flagType: true, detail: true, confidence: true } },
        assets: { select: { id: true, channelName: true, status: true, content: true, validationWarnings: true } },
        sources: { select: { id: true, fileName: true, sourceType: true, status: true, processingError: true } },
      },
    });
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organization.id);
    return NextResponse.json({ case: kase });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load case review." }, { status: 500 });
  }
}