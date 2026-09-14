export interface PhiFlag {
  category: string;
  flaggedSnippet: string;
  remediation: string;
}

export interface SafetyReport {
  isCompliant: boolean;
  phiDetected: PhiFlag[];
  unverifiedClaimsDetected?: PhiFlag[];
  promotionalClaims?: string[];
}

export interface MasterRecord {
  primaryDiagnosis: string;
  specialty: string;
  targetAudience: string;
  clinicalHook: string;
  diagnosticDilemma: string;
  procedureOrIntervention: string;
  clinicalOutcome: string;
  coreEducationalMessage: string;
  presentingComplaint?: string;
  clinicalDecision?: string;
  treatmentPlan?: string;
  outcome?: string;
  keyLearningPoint?: string;
}