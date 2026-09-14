import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadSourceToR2 } from "@/lib/r2";
import { assertCaseQuota } from "@/lib/quotas";
import { requireOrganizationAccess } from "@/lib/tenant-auth";

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

function sourceTypeFor(file: File) {
  if (file.type.startsWith("video/")) return "VIDEO" as const;
  if (DOCUMENT_TYPES.has(file.type) || /\.(pdf|doc|docx|txt|md|csv)$/i.test(file.name)) return "DOCUMENT" as const;
  return null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const organizationId = formData.get("organizationId") as string | null;
    const userId = formData.get("userId") as string | null;
    const physicianId = formData.get("physicianId") as string | null;
    const model = formData.get("model") as string | null;

    if (!file || !organizationId || !physicianId) {
      return NextResponse.json({ error: "file, organizationId, and physicianId are required." }, { status: 400 });
    }
    await requireOrganizationAccess(organizationId);
    await assertCaseQuota(organizationId);

    const sourceType = sourceTypeFor(file);
    if (!sourceType) {
      return NextResponse.json({ error: "Only PDF, DOC/DOCX, text, CSV, Markdown, and video files are supported." }, { status: 415 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "Source files must be 100 MB or smaller." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { r2Key, storageUrl } = await uploadSourceToR2(buffer, file.name, file.type || "application/octet-stream", organizationId);
    const createdCase = await db.case.create({
      data: {
        title: `${sourceType === "VIDEO" ? "Video" : "Document"} Case - ${new Date().toLocaleString("en-IN")}`,
        rawInput: "",
        masterRecord: {},
        safetyAudit: { source: sourceType, status: "AWAITING_PROCESSING" },
        status: "PENDING_REVIEW",
        organizationId,
        physicianId,
      },
    });

    const source = await db.caseSource.create({
      data: {
        sourceType,
        status: "UPLOADED",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        r2Key,
        storageUrl,
        organizationId,
        userId: userId || null,
        caseId: createdCase.id,
      },
    });

    if (sourceType) {
      try {
        const extractionUrl = new URL(`/api/cases/sources/${source.id}/process`, req.url);
        if (model) extractionUrl.searchParams.set("model", model);
        await fetch(extractionUrl, { method: "POST" });
      } catch (processingError) {
        console.error("Document processing dispatch failed:", processingError);
      }
    }

    return NextResponse.json({ success: true, caseId: createdCase.id, source });
  } catch (error: any) {
    console.error("Case source upload failed:", error);
    return NextResponse.json({ error: error.message || "Source upload failed." }, { status: 500 });
  }
}