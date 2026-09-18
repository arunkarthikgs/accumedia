import { withDatabaseClient } from "@/lib/worker-db";
import crypto from "node:crypto";

type CaseVersionSnapshot = {
  caseId: string;
  changeType: string;
  rawInput: string;
  guidedSubmission: unknown;
  masterRecord: unknown;
  safetyAudit: unknown;
  status: string;
};

export async function createCaseVersionSnapshot(snapshot: CaseVersionSnapshot) {
  return withDatabaseClient(async (client) => {
    // Serialize version allocation per case so retries cannot select the same version.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`case-version:${snapshot.caseId}`]);
    const { rows: versionRows } = await client.query<{ nextVersion: number }>(
      `SELECT COALESCE(MAX(version), 0)::int + 1 AS "nextVersion" FROM macula.case_versions WHERE "caseId" = $1`,
      [snapshot.caseId],
    );
    const version = Number(versionRows[0]?.nextVersion || 1);
    await client.query(
      `INSERT INTO macula.case_versions (id, version, "changeType", "rawInput", "guidedSubmission", "masterRecord", "safetyAudit", status, "caseId") VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        crypto.randomUUID(),
        version,
        snapshot.changeType,
        snapshot.rawInput,
        JSON.stringify(snapshot.guidedSubmission ?? null),
        JSON.stringify(snapshot.masterRecord ?? {}),
        JSON.stringify(snapshot.safetyAudit ?? {}),
        snapshot.status,
        snapshot.caseId,
      ],
    );
    return version;
  });
}
