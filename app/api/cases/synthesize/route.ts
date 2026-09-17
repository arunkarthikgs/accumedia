import { NextResponse } from "next/server";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { createOpenAIChatCompletion } from "@/lib/openai-fetch";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { findUnredactedRuleMatches, redactClinicalText, redactClinicalValue } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { assertTokenQuota } from "@/lib/quotas";
import { generateSeoKeywordSet } from "@/lib/seo-keyword-engine";
import { query } from "@/lib/worker-db";
import crypto from "node:crypto";

const REDACTION_MARKERS = [
  { marker: "[REDACTED_DOB]", label: "date of birth" },
  { marker: "[REDACTED_DATE]", label: "date" },
  { marker: "[REDACTED_EMAIL]", label: "email address" },
  { marker: "[REDACTED_PHONE]", label: "phone number" },
  { marker: "[REDACTED_IDENTIFIER]", label: "hospital identifier" },
  { marker: "[REDACTED_AADHAAR]", label: "Aadhaar number" },
  { marker: "[REDACTED_PERSON]", label: "titled person name" },
  { marker: "[REDACTED_PERSONAL_INFORMATION]", label: "labeled personal information" },
  { marker: "[REDACTED_ADDRESS]", label: "residential address" },
  { marker: "[REDACTED_INSURANCE_IDENTIFIER]", label: "insurance identifier" },
  { marker: "[REDACTED_INSURANCE_INFORMATION]", label: "insurance information" },
  { marker: "[REDACTED_EMPLOYMENT_INFORMATION]", label: "employment information" },
];

function summarizeRedactions(value: string) {
  return REDACTION_MARKERS.flatMap(({ marker, label }) => {
    const count = value.split(marker).length - 1;
    return count > 0 ? [`${count} ${label}${count === 1 ? "" : "s"}`] : [];
  });
}

export async function POST(req: Request) {
  try {
    await requireAuthenticatedUser();
    const body = await req.json();
    const { rawText, physicianId, organizationId, audioRecordingId, caseId, inputMode, guidedSubmission } = body;

    if (!rawText || !rawText.trim()) {
      return NextResponse.json(
        { error: "Clinical narrative text is required for synthesis." },
        { status: 400 }
      );
    }
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 }
      );
    }

    await requireOrganizationAccess(organizationId);

    // Resolve Attending Physician / RMP
    let resolvedPhysicianId = physicianId;
    if (!resolvedPhysicianId) {
      resolvedPhysicianId = (await query<{ id: string }>(`SELECT id FROM macula.users WHERE "organizationId" = $1 ORDER BY name ASC LIMIT 1`, [organizationId])).rows[0]?.id || null;
    }

    if (!resolvedPhysicianId) {
      return NextResponse.json(
        { error: "A valid physician user is required to associate with the clinical case." },
        { status: 400 }
      );
    }

    const physician = (await query(`SELECT id FROM macula.users WHERE id = $1 AND "organizationId" = $2 LIMIT 1`, [resolvedPhysicianId, organizationId])).rows[0];
    if (!physician) {
      return NextResponse.json({ error: "Physician does not belong to the requested organization." }, { status: 403 });
    }

    // 1. Fetch organization custom system prompts, compliance rules, and active channel definitions
    const organization = (await query<any>(`SELECT * FROM macula.organizations WHERE id = $1 LIMIT 1`, [organizationId])).rows[0];

    const organizationPrompt = organization?.customSystemPrompt?.trim() || "";
    const promptTemplates = await getResolvedAiPrompts(organizationId, ["MASTER_SYNTHESIS", "SEO_KEYWORDS"]);
    const synthesisPromptTemplate = promptTemplates.get("MASTER_SYNTHESIS");
    const synthesisPrompt = synthesisPromptTemplate?.content || MANDATORY_CLINICAL_SYNTHESIS_PROMPT;

    // 2. Synthesize Master Clinical Record & Redacted PHI Audit via GPT-4o
    const redactionRules = (await query<{ patternOrCheck: string; description: string }>(`SELECT "patternOrCheck", description FROM macula.compliance_rules WHERE "ruleType"='DPDP_REDACTION' AND "isActive"=TRUE AND ("organizationId" IS NULL OR "organizationId"=$1)`, [organizationId])).rows;
    const sanitizedInput = redactClinicalText(rawText.trim(), redactionRules);
    const unresolvedRules = findUnredactedRuleMatches(sanitizedInput, redactionRules);
    if (unresolvedRules.length > 0) {
      if (caseId) {
        await query(`INSERT INTO macula.safety_flags (id, "targetType", "caseId", "flagType", detail, confidence, status) VALUES ($1,'CASE',$2,'pii',$3,'high','OPEN')`, [crypto.randomUUID(), caseId, `LLM synthesis blocked: ${unresolvedRules.join("; ")}. Update the database redaction rule before continuing.`]);
      }
      return NextResponse.json({ error: "Synthesis was blocked because possible identifying information remains after redaction.", safetyReviewRequired: true, unresolvedRules }, { status: 422 });
    }
    await assertTokenQuota(organizationId, Math.ceil(sanitizedInput.length / 4) + 6000);
    const synthesisResponse = await createOpenAIChatCompletion({
      model: "gpt-4o",
      temperature: 0.1,
      jsonMode: true,
      messages: [
        {
          role: "system",
          content: `${synthesisPrompt}

Organization-specific instructions:
${organizationPrompt || "No additional organization-specific instructions were configured."}

You are generating a structured 5-part Master Clinical Record and performing automated DPDP/NMC compliance auditing.

Return ONLY a valid JSON object matching this exact schema:
{
  "caseTitle": "Short informative case title (e.g., Acute Pancreatitis Secondary to Alcohol Consumption)",
  "masterRecord": {
    "topic": "string — the clinical topic or case subject",
    "medicalSpecialty": "string — the relevant medical specialty",
    "targetAudience": "string — patients, families, clinicians, or another defined audience",
    "primaryEducationalMessage": "string — the main educational message",
    "clinicalLearning": "string — the clinical learning point",
    "decisionMaking": "string — the clinical reasoning and decision taken",
    "keyDifferentiatorOrInsight": "string — the important differentiator or insight",
    "patientSafetyConsiderations": ["safety consideration or not provided"],
    "terminologyRetain": ["medical terms that should remain unchanged"],
    "terminologySimplify": ["terms that should be explained in plain language"],
    "confidentialityFlags": ["potential confidentiality or patient-identification issue"],
    "promotionalClaimsRequiringCaution": ["claim requiring caution or none"],
    "chiefComplaints": ["complaint 1", "complaint 2"],
    "historyOfPresentIllness": "Narrative paragraph detailing onset, duration, progression",
    "clinicalExamination": {
      "vitals": {
        "bloodPressure": "...",
        "pulseRate": "...",
        "temperature": "...",
        "respiratoryRate": "...",
        "spo2": "..."
      },
      "systemicFindings": "Systemic findings"
    },
    "investigationsAndLabs": ["lab finding 1", "lab finding 2"],
    "differentialOrFinalDiagnosis": ["diagnosis 1", "diagnosis 2"],
    "managementPlan": {
      "immediateInterventions": ["treatment 1"],
      "medications": [
        {
          "drugName": "...",
          "dosage": "...",
          "route": "...",
          "frequency": "...",
          "duration": "..."
        }
      ],
      "followUpAndMonitoring": "..."
    }
  },
  "safetyAudit": {
    "phiRedactionCheck": {
      "directIdentifiersDetected": false,
      "redactedTokensCount": 0,
      "summary": "DPDP redaction applied"
    },
    "nmcComplianceCheck": {
      "rmpSupervisionFlag": true,
      "unsubstantiatedClaimsFlag": false,
      "prescriptionsValidated": true
    },
    "auditTimestamp": "${new Date().toISOString()}"
  },
}`,
        },
        {
          role: "user",
          content: `Synthesize this refined clinical narrative. The supplied text has been deterministically sanitized before model processing:\n\n${sanitizedInput}`,
        },
      ],
    });

    await logAIUsage({
      organizationId,
      caseId,
      operation: "master_record_synthesis",
      provider: "OpenAI",
      model: "gpt-4o",
      inputTokens: synthesisResponse.usage?.prompt_tokens,
      outputTokens: synthesisResponse.usage?.completion_tokens,
    });

    const parsedOutput = JSON.parse(
      synthesisResponse.choices[0]?.message?.content || "{}"
    );

    const sanitizedOutput = redactClinicalValue(parsedOutput, redactionRules);
    const generatedTitle = sanitizedOutput.caseTitle || "Clinical Case Record";
    const rawMasterRecord = sanitizedOutput.masterRecord || {};
    const masterRecord = {
      topic: rawMasterRecord.topic || generatedTitle,
      medicalSpecialty: rawMasterRecord.medicalSpecialty || "Not provided",
      targetAudience: rawMasterRecord.targetAudience || "Not provided",
      primaryEducationalMessage: rawMasterRecord.primaryEducationalMessage || "Not provided",
      clinicalLearning: rawMasterRecord.clinicalLearning || "Not provided",
      decisionMaking: rawMasterRecord.decisionMaking || "Not provided",
      keyDifferentiatorOrInsight: rawMasterRecord.keyDifferentiatorOrInsight || "Not provided",
      patientSafetyConsiderations: Array.isArray(rawMasterRecord.patientSafetyConsiderations) ? rawMasterRecord.patientSafetyConsiderations : ["Not provided"],
      terminologyRetain: Array.isArray(rawMasterRecord.terminologyRetain) ? rawMasterRecord.terminologyRetain : [],
      terminologySimplify: Array.isArray(rawMasterRecord.terminologySimplify) ? rawMasterRecord.terminologySimplify : [],
      confidentialityFlags: Array.isArray(rawMasterRecord.confidentialityFlags) ? rawMasterRecord.confidentialityFlags : [],
      promotionalClaimsRequiringCaution: Array.isArray(rawMasterRecord.promotionalClaimsRequiringCaution) ? rawMasterRecord.promotionalClaimsRequiringCaution : [],
      ...rawMasterRecord,
    };
    const safetyAudit = sanitizedOutput.safetyAudit || {};

    let targetCaseId = caseId;

    // If caseId was not passed directly, look for an unfinalized case linked to the audio recording
    if (!targetCaseId && audioRecordingId) {
      const recording = (await query<{ caseId: string | null }>(`SELECT "caseId" FROM macula.audio_recordings WHERE id = $1 LIMIT 1`, [audioRecordingId])).rows[0];
      if (recording?.caseId) {
        targetCaseId = recording.caseId;
      }
    }

    let finalizedCase;
    const previousCase = targetCaseId ? (await query<any>(`SELECT * FROM macula.cases WHERE id = $1 LIMIT 1`, [targetCaseId])).rows[0] : null;
    if (previousCase && previousCase.organizationId !== organizationId) {
      return NextResponse.json({ error: "Case belongs to another organization." }, { status: 403 });
    }

    const seoPromptTemplate = promptTemplates.get("SEO_KEYWORDS");
    const seoKeywordResult = await generateSeoKeywordSet({ masterRecord, prompt: seoPromptTemplate?.content });
    await logAIUsage({ organizationId, caseId: targetCaseId || undefined, operation: "seo_keyword_generation", provider: "OpenAI", model: "gpt-4o", inputTokens: seoKeywordResult.usage?.prompt_tokens, outputTokens: seoKeywordResult.usage?.completion_tokens, metadata: { promptTemplateId: seoPromptTemplate?.id, promptVersion: seoPromptTemplate?.version } });
    const seoKeywords = seoKeywordResult.keywords;
    const seoQuality = seoKeywordResult.quality;

    if (previousCase) {
      const versionCount = Number((await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM macula.case_versions WHERE "caseId"=$1`, [previousCase.id])).rows[0]?.count || 0);
      await query(`INSERT INTO macula.case_versions (id, version, "changeType", "rawInput", "guidedSubmission", "masterRecord", "safetyAudit", status, "caseId") VALUES ($1,$2,'pre_synthesis_snapshot',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)`, [crypto.randomUUID(), versionCount + 1, previousCase.raw_input, JSON.stringify(previousCase.guidedSubmission), JSON.stringify(previousCase.masterRecord), JSON.stringify(previousCase.safetyAudit), previousCase.status, previousCase.id]);
    }

    // 3. Update existing Case (if initiated during audio upload) OR create new Case
    if (targetCaseId) {
      finalizedCase = (await query<any>(`UPDATE macula.cases SET title=$1, raw_input=$2, "guidedSubmission"=$3::jsonb, "masterRecord"=$4::jsonb, "safetyAudit"=$5::jsonb, "synthesisPromptTemplateId"=$6, "synthesisPromptVersion"=$7, status='PENDING_REVIEW', "physicianId"=$8, "organizationId"=$9, "updatedAt"=NOW() WHERE id=$10 RETURNING *`, [generatedTitle, sanitizedInput, JSON.stringify(guidedSubmission && typeof guidedSubmission === "object" ? guidedSubmission : null), JSON.stringify(masterRecord), JSON.stringify(safetyAudit), synthesisPromptTemplate?.id || null, synthesisPromptTemplate?.version || null, resolvedPhysicianId, organizationId, targetCaseId])).rows[0];
    } else {
      finalizedCase = (await query<any>(`INSERT INTO macula.cases (id,title,raw_input,"guidedSubmission","masterRecord","safetyAudit","synthesisPromptTemplateId","synthesisPromptVersion",status,"physicianId","organizationId") VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,'PENDING_REVIEW',$9,$10) RETURNING *`, [crypto.randomUUID(), generatedTitle, sanitizedInput, JSON.stringify(guidedSubmission && typeof guidedSubmission === "object" ? guidedSubmission : null), JSON.stringify(masterRecord), JSON.stringify(safetyAudit), synthesisPromptTemplate?.id || null, synthesisPromptTemplate?.version || null, resolvedPhysicianId, organizationId])).rows[0];
    }

    if (!previousCase) {
      await query(`INSERT INTO macula.case_versions (id,version,"changeType","rawInput","guidedSubmission","masterRecord","safetyAudit",status,"caseId") VALUES ($1,1,'initial_synthesis',$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7)`, [crypto.randomUUID(), finalizedCase.raw_input, JSON.stringify(finalizedCase.guidedSubmission), JSON.stringify(finalizedCase.masterRecord), JSON.stringify(finalizedCase.safetyAudit), finalizedCase.status, finalizedCase.id]);
    }

    await query(`INSERT INTO macula.seo_keyword_sets (id, "caseId", "primaryKeyword", "secondaryKeywords", "longTailKeywords", "localKeywords", "questionKeywords", "semanticKeywords", "searchIntent", "qualityScore", "validationIssues", "contentHash") VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12) ON CONFLICT ("caseId") DO UPDATE SET "primaryKeyword"=EXCLUDED."primaryKeyword", "secondaryKeywords"=EXCLUDED."secondaryKeywords", "longTailKeywords"=EXCLUDED."longTailKeywords", "localKeywords"=EXCLUDED."localKeywords", "questionKeywords"=EXCLUDED."questionKeywords", "semanticKeywords"=EXCLUDED."semanticKeywords", "searchIntent"=EXCLUDED."searchIntent", "qualityScore"=EXCLUDED."qualityScore", "validationIssues"=EXCLUDED."validationIssues", "contentHash"=EXCLUDED."contentHash", "updatedAt"=NOW()`, [crypto.randomUUID(), finalizedCase.id, seoKeywords.primaryKeyword || null, JSON.stringify(seoKeywords.secondaryKeywords || []), JSON.stringify(seoKeywords.longTailKeywords || []), JSON.stringify(seoKeywords.localKeywords || []), JSON.stringify(seoKeywords.questionKeywords || []), JSON.stringify(seoKeywords.semanticKeywords || []), seoKeywords.searchIntent || null, seoQuality.score, JSON.stringify(seoQuality.issues), seoQuality.contentHash]);

    // 4. Ensure Audio Recording is linked if supplied
    if (audioRecordingId) {
      await query(`UPDATE macula.audio_recordings SET "caseId"=$1, "updatedAt"=NOW() WHERE id=$2`, [finalizedCase.id, audioRecordingId]);
    }

    // Materialize compliance findings into the human-review queue. The case
    // JSON remains the audit record; SafetyFlag rows drive queue decisions.
    await query(`DELETE FROM macula.safety_flags WHERE "caseId"=$1 AND status='OPEN'`, [finalizedCase.id]);

    const phiCheck = safetyAudit?.phiRedactionCheck || {};
    const ethicsCheck = safetyAudit?.nmcComplianceCheck || {};
    const findings: Array<{ flagType: string; detail: string; confidence: string }> = [];
    const redactionSummary = summarizeRedactions(rawText);

    if (redactionSummary.length > 0) {
      findings.push({
        flagType: "pii",
        detail: `Removed during refinement: ${redactionSummary.join(", ")}. Confirm no patient-identifying context remains before approval.`,
        confidence: "high",
      });
    } else if (phiCheck.directIdentifiersDetected || Number(phiCheck.redactedTokensCount || 0) > 0) {
      findings.push({
        flagType: "pii",
        detail: phiCheck.summary || "Personal or health identifiers were detected and redacted; confirm the sanitized record.",
        confidence: "high",
      });
    }
    if (ethicsCheck.unsubstantiatedClaimsFlag) {
      findings.push({
        flagType: "claim",
        detail: "Unsubstantiated or promotional clinical claims require human review.",
        confidence: "high",
      });
    }
    if (ethicsCheck.rmpSupervisionFlag === false || ethicsCheck.prescriptionsValidated === false) {
      findings.push({
        flagType: "compliance",
        detail: "Regulatory supervision or prescription validation requires human review.",
        confidence: "medium",
      });
    }

    if (findings.length > 0) {
      for (const finding of findings) await query(`INSERT INTO macula.safety_flags (id, "targetType", "caseId", "flagType", detail, confidence, status) VALUES ($1,'CASE',$2,$3,$4,$5,'OPEN')`, [crypto.randomUUID(), finalizedCase.id, finding.flagType, finding.detail, finding.confidence]);
    }

    return NextResponse.json({
      success: true,
      case: finalizedCase,
      safetyFlagsCount: findings.length,
      assetsCount: 0,
      assetsGeneration: "available_after_master_record_approval",
    });
  } catch (error: any) {
    console.error("Clinical synthesis error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synthesize clinical record." },
      { status: 500 }
    );
  }
}
