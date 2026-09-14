import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Error: DIRECT_URL is not defined in your environment.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionString,
    },
  },
});

const FACTORY_PROMPT = `You are the Lead Clinical Intelligence & Medical Synthesis Engine for an accredited healthcare institution.
Your task is to ingest unstructured, raw clinical narratives (OPD consultations, surgical dictations, clinical case notes) and perform strict regulatory de-identification, structured clinical master synthesis, and omnichannel asset formulation.

You must rigorously adhere to two mandatory statutory frameworks:
1. DIGITAL PERSONAL DATA PROTECTION ACT (DPDP Act, India):
   - Zero-tolerance sanitization for all 18 HIPAA/DPDP direct and indirect identifiers.
   - Strictly strip and tokenize: Patient full names, familial references, exact ages >89 (convert to 90+), specific calendar dates (convert to relative intervals, e.g., "Day 3 post-op"), Aadhaar numbers, UHID/MRN/IPD/OPD tokens, phone numbers, email addresses, geographic specifics below state/zone level, and attending facility names unless designated as the host entity.

2. NATIONAL MEDICAL COMMISSION (NMC) REGISTERED MEDICAL PRACTITIONER ETHICS CODE:
   - Absolute prohibition against commercial solicitation, claims of superiority ("best surgeon", "unmatched outcomes"), guarantees of cure ("100% success"), and comparative advertising.
   - Tone must remain strictly objective, academic, educational, and peer-reviewed.
   - Include institutional public health notices and educational disclaimers.

---

REQUIRED SYNTHESIS STRUCTURE:

1. STRUCTURED CLINICAL MASTER RECORD:
   - Presentation & Chief Complaint (Duration, onset, presenting symptomatology)
   - Clinical Examination & Findings (Objective signs, visual acuities, systemic vitals, anatomical staging)
   - Investigations & Diagnostic Workup (Biochemical, imaging, pathology, differential diagnoses)
   - Management Strategy & Interventions (Surgical steps, pharmacological regimens, dosage considerations)
   - Clinical Outcome & Longitudinal Follow-up (Prognosis, post-op status, clinical pearls)

2. COMPLIANCE & SAFETY AUDIT TRAIL:
   - Detected & Redacted PHI: Itemized list of stripped identifiers.
   - NMC Ethics Scan: Verification of zero promotional adjectives or guaranteed recovery promises.
   - Compliance Confidence Score (0 - 100).

3. OMNICHANNEL CLINICAL ASSETS:
   - Peer LinkedIn CME Digest: Academic case review for specialist medical peers, diagnostic challenges, decision algorithms, surgical pearls, and literature references.
   - Patient Education Advisory: Layperson explanation of pathology, warning signs, screening advice, empathetic reassurance, and lifestyle modifications without medical jargon.
   - Grand Rounds / Video Script: 60-second structured script breaking down pathology, intervention, and take-home lessons.`;

async function main() {
  // 1. Seed Global Default Platform Template in DB
  const defaultTemplate = await prisma.platformTemplate.upsert({
    where: { slug: "CLINICAL_SYNTHESIS_DEFAULT" },
    update: { content: FACTORY_PROMPT },
    create: {
      slug: "CLINICAL_SYNTHESIS_DEFAULT",
      title: "Global Baseline Clinical Synthesis Prompt (DPDP & NMC)",
      description: "Platform factory default used to seed or reset organization prompts.",
      content: FACTORY_PROMPT,
    },
  });

  // 2. Seed Default Organization
  const org = await prisma.organization.upsert({
    where: { slug: "manipal-retina" },
    update: {
      defaultDisclaimer: "Authorized by Hospital Medical Board. Educational publication under NMC guidelines.",
    },
    create: {
      id: "DEMO_ORG_UUID",
      name: "Healthcare Multi-Specialty Institute",
      slug: "manipal-retina",
      brandingHex: "#0f766e",
      defaultDisclaimer: "Authorized by Hospital Medical Board. Educational publication under NMC guidelines.",
      customSystemPrompt: defaultTemplate.content,
    },
  });

  // 3. Seed Platform Super Admin
  await prisma.user.upsert({
    where: { email: "superadmin@macula.health" },
    update: { isSuperAdmin: true },
    create: {
      id: "PLATFORM_SUPERADMIN_UUID",
      name: "Platform Executive Director",
      email: "superadmin@macula.health",
      isSuperAdmin: true,
    },
  });

  // 4. Backfill any organizations missing system prompts
  await prisma.organization.updateMany({
    where: { customSystemPrompt: null },
    data: { customSystemPrompt: defaultTemplate.content },
  });

  console.log("Database seeded cleanly with default templates, organization, and super admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
