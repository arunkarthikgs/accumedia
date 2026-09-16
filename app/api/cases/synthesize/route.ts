import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import OpenAI from "openai";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "@/lib/prompts/clinical-synthesis";
import { getResolvedAiPrompts } from "@/lib/ai-prompts";
import { findUnredactedRuleMatches, redactClinicalText, redactClinicalValue } from "@/lib/prompts/clinical-redaction";
import { logAIUsage } from "@/lib/ai-usage";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/tenant-auth";
import { assertTokenQuota } from "@/lib/quotas";
import { generateSeoKeywordSet } from "@/lib/seo-keyword-engine";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    if (inputMode !== "audio") {
      const wordCount = rawText.trim().split(/\s+/).length;
      if (wordCount < 200 || wordCount > 300) {
        return NextResponse.json({ error: `Source content should be approximately 200–300 words. Current count: ${wordCount}.` }, { status: 422 });
      }
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
      const fallbackUser = await db.user.findFirst({
        where: { organizationId },
      });
      resolvedPhysicianId = fallbackUser?.id || null;
    }

    if (!resolvedPhysicianId) {
      return NextResponse.json(
        { error: "A valid physician user is required to associate with the clinical case." },
        { status: 400 }
      );
    }

    const physician = await db.user.findFirst({
      where: { id: resolvedPhysicianId, organizationId },
      select: { id: true },
    });
    if (!physician) {
      return NextResponse.json({ error: "Physician does not belong to the requested organization." }, { status: 403 });
    }

    // 1. Fetch organization custom system prompts, compliance rules, and active channel definitions
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        channelDefinitions: { where: { isActive: true } },
        complianceRules: { where: { isActive: true } },
      },
    });

    const organizationPrompt = organization?.customSystemPrompt?.trim() || "";
    const promptTemplates = await getResolvedAiPrompts(organizationId, ["MASTER_SYNTHESIS", "SEO_KEYWORDS"]);
    const synthesisPromptTemplate = promptTemplates.get("MASTER_SYNTHESIS");
    const synthesisPrompt = synthesisPromptTemplate?.content || MANDATORY_CLINICAL_SYNTHESIS_PROMPT;

    // 2. Synthesize Master Clinical Record & Redacted PHI Audit via GPT-4o
    const redactionRules = await db.complianceRule.findMany({
      where: {
        ruleType: "DPDP_REDACTION",
        isActive: true,
        OR: [{ organizationId: null }, { organizationId }],
      },
      select: { patternOrCheck: true, description: true },
    });
    const sanitizedInput = redactClinicalText(rawText.trim(), redactionRules);
    const unresolvedRules = findUnredactedRuleMatches(sanitizedInput, redactionRules);
    if (unresolvedRules.length > 0) {
      if (caseId) {
        await db.safetyFlag.create({
          data: {
            targetType: "CASE",
            caseId,
            flagType: "pii",
            detail: `LLM synthesis blocked: ${unresolvedRules.join("; ")}. Update the database redaction rule before continuing.`,
            confidence: "high",
            status: "OPEN",
          },
        });
      }
      return NextResponse.json({ error: "Synthesis was blocked because possible identifying information remains after redaction.", safetyReviewRequired: true, unresolvedRules }, { status: 422 });
    }
    await assertTokenQuota(organizationId, Math.ceil(sanitizedInput.length / 4) + 6000);
    const synthesisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
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
      const recording = await db.audioRecording.findUnique({
        where: { id: audioRecordingId },
        select: { caseId: true },
      });
      if (recording?.caseId) {
        targetCaseId = recording.caseId;
      }
    }

    let finalizedCase;
    const previousCase = targetCaseId
      ? await db.case.findUnique({ where: { id: targetCaseId } })
      : null;
    if (previousCase && previousCase.organizationId !== organizationId) {
      return NextResponse.json({ error: "Case belongs to another organization." }, { status: 403 });
    }

    const seoPromptTemplate = promptTemplates.get("SEO_KEYWORDS");
    const seoKeywordResult = await generateSeoKeywordSet({ masterRecord, prompt: seoPromptTemplate?.content });
    await logAIUsage({ organizationId, caseId: targetCaseId || undefined, operation: "seo_keyword_generation", provider: "OpenAI", model: "gpt-4o", inputTokens: seoKeywordResult.usage?.prompt_tokens, outputTokens: seoKeywordResult.usage?.completion_tokens, metadata: { promptTemplateId: seoPromptTemplate?.id, promptVersion: seoPromptTemplate?.version } });
    const seoKeywords = seoKeywordResult.keywords;
    const seoQuality = seoKeywordResult.quality;

    if (previousCase) {
      const versionCount = await db.caseVersion.count({ where: { caseId: previousCase.id } });
      await db.caseVersion.create({
        data: {
          caseId: previousCase.id,
          version: versionCount + 1,
          changeType: "pre_synthesis_snapshot",
          rawInput: previousCase.rawInput,
          guidedSubmission: previousCase.guidedSubmission,
          masterRecord: previousCase.masterRecord,
          safetyAudit: previousCase.safetyAudit,
          status: previousCase.status,
        },
      });
    }

    // 3. Update existing Case (if initiated during audio upload) OR create new Case
    if (targetCaseId) {
      finalizedCase = await db.case.update({
        where: { id: targetCaseId },
        data: {
          title: generatedTitle,
          rawInput: sanitizedInput,
          guidedSubmission: guidedSubmission && typeof guidedSubmission === "object" ? guidedSubmission : null,
          masterRecord,
          safetyAudit,
          synthesisPromptTemplateId: synthesisPromptTemplate?.id || null,
          synthesisPromptVersion: synthesisPromptTemplate?.version || null,
          status: "PENDING_REVIEW",
          physicianId: resolvedPhysicianId,
          organizationId,
        },
      });
    } else {
      finalizedCase = await db.case.create({
        data: {
          title: generatedTitle,
          rawInput: sanitizedInput,
          guidedSubmission: guidedSubmission && typeof guidedSubmission === "object" ? guidedSubmission : null,
          masterRecord,
          safetyAudit,
          synthesisPromptTemplateId: synthesisPromptTemplate?.id || null,
          synthesisPromptVersion: synthesisPromptTemplate?.version || null,
          status: "PENDING_REVIEW",
          physicianId: resolvedPhysicianId,
          organizationId,
        },
      });
    }

    if (!previousCase) {
      await db.caseVersion.create({
        data: {
          caseId: finalizedCase.id,
          version: 1,
          changeType: "initial_synthesis",
          rawInput: finalizedCase.rawInput,
          guidedSubmission: finalizedCase.guidedSubmission,
          masterRecord: finalizedCase.masterRecord,
          safetyAudit: finalizedCase.safetyAudit,
          status: finalizedCase.status,
        },
      });
    }

    await db.seoKeywordSet.upsert({
      where: { caseId: finalizedCase.id },
      create: {
        caseId: finalizedCase.id,
        primaryKeyword: seoKeywords.primaryKeyword || null,
        secondaryKeywords: seoKeywords.secondaryKeywords || [],
        longTailKeywords: seoKeywords.longTailKeywords || [],
        localKeywords: seoKeywords.localKeywords || [],
        questionKeywords: seoKeywords.questionKeywords || [],
        semanticKeywords: seoKeywords.semanticKeywords || [],
        searchIntent: seoKeywords.searchIntent || null,
        qualityScore: seoQuality.score,
        validationIssues: seoQuality.issues,
        contentHash: seoQuality.contentHash,
      },
      update: {
        primaryKeyword: seoKeywords.primaryKeyword || null,
        secondaryKeywords: seoKeywords.secondaryKeywords || [],
        longTailKeywords: seoKeywords.longTailKeywords || [],
        localKeywords: seoKeywords.localKeywords || [],
        questionKeywords: seoKeywords.questionKeywords || [],
        semanticKeywords: seoKeywords.semanticKeywords || [],
        searchIntent: seoKeywords.searchIntent || null,
        qualityScore: seoQuality.score,
        validationIssues: seoQuality.issues,
        contentHash: seoQuality.contentHash,
      },
    });

    // 4. Ensure Audio Recording is linked if supplied
    if (audioRecordingId) {
      await db.audioRecording.update({
        where: { id: audioRecordingId },
        data: {
          caseId: finalizedCase.id,
        },
      });
    }

    // Materialize compliance findings into the human-review queue. The case
    // JSON remains the audit record; SafetyFlag rows drive queue decisions.
    await db.safetyFlag.deleteMany({
      where: { caseId: finalizedCase.id, status: "OPEN" },
    });

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
      await db.safetyFlag.createMany({
        data: findings.map((finding) => ({
          targetType: "CASE",
          caseId: finalizedCase.id,
          flagType: finding.flagType,
          detail: finding.detail,
          confidence: finding.confidence,
          status: "OPEN",
        })),
      });
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
