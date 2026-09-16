import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import { query } from "@/lib/worker-db";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { rows } = await query<any>(`SELECT c.id, c.title, c.status, c.raw_input AS "rawInput", c."guidedSubmission" AS "guidedSubmission", c."masterRecord" AS "masterRecord", c."safetyAudit" AS "safetyAudit",
      json_build_object('id', u.id, 'name', u.name, 'specialty', u.specialty) AS physician,
      json_build_object('name', o.name, 'id', o.id) AS organization,
      COALESCE((SELECT json_agg(json_build_object('id', ar.id, 'rawTranscript', ar."rawTranscript", 'transcribedText', ar."transcribedText", 'transcriptionAgent', ar."transcriptionAgent", 'fileName', ar."fileName", 'durationSeconds', ar."durationSeconds")) FROM macula.macula_audio_recordings ar WHERE ar."caseId" = c.id), '[]') AS recordings,
      COALESCE((SELECT json_agg(json_build_object('id', sf.id, 'flagType', sf."flagType", 'detail', sf.detail, 'confidence', sf.confidence)) FROM macula.macula_safety_flags sf WHERE sf."caseId" = c.id AND sf.status = 'OPEN'), '[]') AS "safetyFlags",
      COALESCE((SELECT json_agg(json_build_object('id', ga.id, 'channelName', ga."channelName", 'status', ga.status, 'content', ga.content, 'validationWarnings', ga."validationWarnings")) FROM macula.macula_generated_assets ga WHERE ga."caseId" = c.id), '[]') AS assets,
      COALESCE((SELECT json_agg(json_build_object('id', cs.id, 'fileName', cs."fileName", 'sourceType', cs."sourceType", 'status', cs.status, 'processingError', cs."processingError")) FROM macula.macula_case_sources cs WHERE cs."caseId" = c.id), '[]') AS sources
      FROM macula.macula_cases c JOIN macula.macula_users u ON u.id = c."physicianId" JOIN macula.macula_organizations o ON o.id = c."organizationId" WHERE c.id = $1 LIMIT 1`, [id]);
    const kase = rows[0];
    if (!kase) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    await requireOrganizationAccess(kase.organization.id);
    return NextResponse.json({ case: kase });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unable to load case review." }, { status: 500 });
  }
}