import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const versions = await db.caseVersion.findMany({
      where: { caseId: id },
      orderBy: { version: "desc" },
    });
    return NextResponse.json({ versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load case versions." }, { status: 500 });
  }
}