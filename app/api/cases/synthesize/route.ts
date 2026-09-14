import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawText, physicianId, organizationId, audioRecordingId, caseId } = body;

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

    // 1. Fetch organization custom system prompts, compliance rules, and active channel definitions
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        channelDefinitions: { where: { isActive: true } },
        complianceRules: { where: { isActive: true } },
      },
    });

    const customSystemPrompt =
      organization?.customSystemPrompt ||
      "You are a clinical intelligence documentation assistant strictly following NMC guidelines.";

    // 2. Synthesize Master Clinical Record & Redacted PHI Audit via GPT-4o
    const synthesisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${customSystemPrompt}

You are generating a structured 5-part Master Clinical Record and performing automated DPDP/NMC compliance auditing.

Return ONLY a valid JSON object matching this exact schema:
{
  "caseTitle": "Short informative case title (e.g., Acute Pancreatitis Secondary to Alcohol Consumption)",
  "masterRecord": {
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
  "channelDrafts": [
    {
      "channelKey": "DISCHARGE_SUMMARY",
      "channelName": "Discharge Summary",
      "content": {
        "summary": "...",
        "patientCareInstructions": "..."
      }
    },
    {
      "channelKey": "REFERRAL_LETTER",
      "channelName": "Specialist Referral Letter",
      "content": {
        "referralReason": "...",
        "clinicalSummary": "..."
      }
    }
  ]
}`,
        },
        {
          role: "user",
          content: `Synthesize this refined clinical narrative:\n\n${rawText.trim()}`,
        },
      ],
    });

    const parsedOutput = JSON.parse(
      synthesisResponse.choices[0]?.message?.content || "{}"
    );

    const generatedTitle = parsedOutput.caseTitle || "Clinical Case Record";
    const masterRecord = parsedOutput.masterRecord || {};
    const safetyAudit = parsedOutput.safetyAudit || {};
    const channelDrafts = Array.isArray(parsedOutput.channelDrafts)
      ? parsedOutput.channelDrafts
      : [];

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

    // 3. Update existing Case (if initiated during audio upload) OR create new Case
    if (targetCaseId) {
      finalizedCase = await db.case.update({
        where: { id: targetCaseId },
        data: {
          title: generatedTitle,
          rawInput: rawText.trim(),
          masterRecord,
          safetyAudit,
          status: "PENDING_REVIEW",
          physicianId: resolvedPhysicianId,
          organizationId,
        },
      });
    } else {
      finalizedCase = await db.case.create({
        data: {
          title: generatedTitle,
          rawInput: rawText.trim(),
          masterRecord,
          safetyAudit,
          status: "PENDING_REVIEW",
          physicianId: resolvedPhysicianId,
          organizationId,
        },
      });
    }

    // 4. Ensure Audio Recording is linked if supplied
    if (audioRecordingId) {
      await db.audioRecording.update({
        where: { id: audioRecordingId },
        data: {
          caseId: finalizedCase.id,
        },
      });
    }

    // 5. Upsert downstream generated assets (e.g. Discharge Summary, Referral Letter)
    await db.generatedAsset.deleteMany({
      where: { caseId: finalizedCase.id },
    });

    if (channelDrafts.length > 0) {
      await db.generatedAsset.createMany({
        data: channelDrafts.map((draft: any) => ({
          caseId: finalizedCase.id,
          channelKey: draft.channelKey || "DEFAULT",
          channelName: draft.channelName || "Clinical Channel Asset",
          content: draft.content || {},
        })),
      });
    }

    return NextResponse.json({
      success: true,
      case: finalizedCase,
      assetsCount: channelDrafts.length,
    });
  } catch (error: any) {
    console.error("Clinical synthesis error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synthesize clinical record." },
      { status: 500 }
    );
  }
}
