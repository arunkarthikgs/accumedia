import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getASRProvider } from "@/lib/asr/factory";
import { refineClinicalText } from "@/lib/clinical-refiner";
import type { MasterRecord, SafetyReport } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * RECONSTRUCTED FILE — replaces a version I rewrote earlier without
 * realizing CaseWorkflowStudio.tsx (the real, currently-used intake
 * component) calls this with FormData and expects { masterRecord,
 * safetyAudit } back, not the JSON-body / different-field-names version I
 * wrote before. This version matches CaseWorkflowStudio.tsx's actual
 * request/response contract:
 *
 *   const fd = new FormData();
 *   if (audioBlob) fd.append("audio", audioBlob);
 *   if (inputText) fd.append("text", inputText);
 *   const res = await fetch("/api/cases/synthesize", { method: "POST", body: fd });
 *   const data = await res.json();
 *   setMasterRecord(data.masterRecord);
 *   setSafetyReport(data.safetyAudit);
 *
 * This route does NOT write to the database — CaseWorkflowStudio holds
 * masterRecord/safetyReport in local state until the doctor clicks
 * "Sign-Off & Generate", which is a separate call to POST /api/cases
 * (see app/api/cases/route.ts) that actually persists the Case.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const typedText = ((formData.get("text") as string | null) || "").trim();

    let narrative = typedText;

    if (audioFile && audioFile.size > 0) {
      const arrayBuffer = await audioFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const asrProvider = getASRProvider();
      const asrResult = await asrProvider.transcribe({
        buffer,
        fileName: audioFile.name || "recording.webm",
        mimeType: audioFile.type || "audio/webm",
      });

      const refinedTranscript = await refineClinicalText(asrResult.rawTranscript);
      narrative = narrative ? `${refinedTranscript}\n\n${narrative}` : refinedTranscript;
    }

    if (!narrative.trim()) {
      return NextResponse.json(
        { error: "Provide a voice recording or typed clinical narrative before synthesizing." },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1, // low temperature — this is structuring/screening, not creative generation
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a clinical documentation structuring assistant for healthcare practitioners in India.
You are not diagnosing, and you are not giving medical advice — you are organizing
a doctor's own dictated or typed case narrative into a structured record, and
screening it for patient-identifying information and DPDP/NMC medical
advertising compliance issues.

Return ONLY JSON matching this exact shape:
{
  "masterRecord": {
    "primaryDiagnosis": "string — the main diagnosis or clinical topic",
    "specialty": "string — the relevant medical specialty",
    "targetAudience": "string — e.g. 'patients', 'referring physicians', 'general public'",
    "coreEducationalMessage": "string — one sentence, the key takeaway for the target audience",
    "presentingComplaint": "string — what the patient presented with",
    "clinicalDecision": "string — the decision taken and why",
    "treatmentPlan": "string — what was done",
    "outcome": "string — what happened afterwards",
    "keyLearningPoint": "string — what a reader should learn from this case"
  },
  "safetyAudit": {
    "isCompliant": true or false,
    "phiDetected": [
      { "category": "string — e.g. 'Patient Name', 'Contact Number', 'Specific Address'",
        "flaggedSnippet": "string — the exact identifying text found",
        "remediation": "string — how it was generalized/de-identified in masterRecord" }
    ],
    "promotionalClaims": ["string — any absolute/guaranteed-outcome language found, e.g. '100% success rate'"]
  }
}

Rules:
- Never invent clinical facts not present in the narrative.
- Every field in masterRecord must already be de-identified — do not carry
  patient names, contact details, exact addresses, or other direct
  identifiers into masterRecord. List what you removed under phiDetected.
- isCompliant is false if any high-confidence PHI or unremediated
  promotional claim remains after your own remediation — this is a
  self-report, a human still reviews it downstream.
- Do not include any conversational text outside the JSON object.`,
        },
        { role: "user", content: `Clinical narrative:\n\n${narrative}` },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const masterRecord: MasterRecord = parsed.masterRecord || {};
    const safetyAudit: SafetyReport = parsed.safetyAudit || { isCompliant: false, phiDetected: [] };

    return NextResponse.json({ masterRecord, safetyAudit });
  } catch (error: any) {
    console.error("Synthesis error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synthesize the clinical narrative." },
      { status: 500 }
    );
  }
}
