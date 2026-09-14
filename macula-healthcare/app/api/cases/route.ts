import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const cases = await db.case.findMany({
      orderBy: { createdAt: "desc" },
      include: { physician: true, organization: true },
      take: 20,
    });
    return NextResponse.json(cases);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawInput, masterRecord, safetyAudit, physicianId, organizationId } = body;

    const newCase = await db.case.create({
      data: {
        title: masterRecord.primaryDiagnosis,
        rawInput,
        masterRecord,
        safetyAudit,
        status: "PENDING_REVIEW",
        physicianId,
        organizationId,
      },
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
