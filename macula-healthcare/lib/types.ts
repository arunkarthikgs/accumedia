import { z } from "zod";

export const PhiFlagSchema = z.object({
  category: z.string(),
  flaggedSnippet: z.string(),
  remediation: z.string(),
});

export const SafetyReportSchema = z.object({
  isCompliant: z.boolean(),
  phiDetected: z.array(PhiFlagSchema),
  unverifiedClaimsDetected: z.array(PhiFlagSchema),
});

export const MasterRecordSchema = z.object({
  primaryDiagnosis: z.string(),
  specialty: z.string(),
  targetAudience: z.string(),
  clinicalHook: z.string(),
  diagnosticDilemma: z.string(),
  procedureOrIntervention: z.string(),
  clinicalOutcome: z.string(),
  coreEducationalMessage: z.string(),
});

export type SafetyReport = z.infer<typeof SafetyReportSchema>;
export type MasterRecord = z.infer<typeof MasterRecordSchema>;
