#!/usr/bin/env bash
set -e

PROJECT_NAME="macula-healthcare"

echo "Initializing complete deployment package for ${PROJECT_NAME}..."

# 1. Create project root and directory scaffold
mkdir -p "${PROJECT_NAME}"
cd "${PROJECT_NAME}"

mkdir -p prisma
mkdir -p lib/prompts
mkdir -p app/cases/new
mkdir -p app/cases/'[id]'/review
mkdir -p app/cases/'[id]'/assets
mkdir -p app/settings/prompts
mkdir -p app/settings/roles
mkdir -p app/api/cases/synthesize
mkdir -p app/api/cases/'[id]'/approve
mkdir -p app/api/settings/prompt
mkdir -p app/api/settings/roles/matrix

# -----------------------------------------------------------------------------
# 2. Root Build & Cloudflare Configurations
# -----------------------------------------------------------------------------

cat << 'EOF' > package.json
{
  "name": "macula-healthcare",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "build:worker": "open-next build --target cloudflare",
    "deploy": "npm run build:worker && wrangler deploy",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@ai-sdk/openai": "^1.1.0",
    "@opennextjs/cloudflare": "^0.5.0",
    "@prisma/adapter-pg": "^6.4.0",
    "@prisma/client": "^6.4.0",
    "ai": "^4.1.0",
    "lucide-react": "^0.475.0",
    "next": "^15.1.0",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.13.0",
    "@types/pg": "^8.11.11",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "postcss": "^8.5.1",
    "prisma": "^6.4.0",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "wrangler": "^3.109.0"
  }
}
EOF

cat << 'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat << 'EOF' > wrangler.toml
name = "macula-healthcare"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

# Cloudflare Hyperdrive connection pooler targeting RDS in ap-south-1 (Mumbai)
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_CONFIG_ID"

[vars]
NEXT_PUBLIC_APP_URL = "https://macula.yourhospital.in"
EOF

cat << 'EOF' > next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
EOF

cat << 'EOF' > tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
EOF

cat << 'EOF' > postcss.config.mjs
const config = {
  plugins: {
    tailwindcss: {},
  },
};
export default config;
EOF

cat << 'EOF' > .env.example
# Direct connection to AWS RDS PostgreSQL (ap-south-1) for CLI migrations
DIRECT_URL="postgresql://macula_admin:YOUR_PASSWORD@rds-endpoint.ap-south-1.rds.amazonaws.com:5432/macula_prod?sslmode=require"

# Cloudflare Hyperdrive connection string or local fallback
HYPERDRIVE_URL="postgresql://macula_admin:YOUR_PASSWORD@rds-endpoint.ap-south-1.rds.amazonaws.com:5432/macula_prod?sslmode=require"

# LLM Synthesis API Key
OPENAI_API_KEY="sk-proj-..."
EOF

cat << 'EOF' > middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/request";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect administrative routes at the Cloudflare Edge layer
  if (pathname.startsWith("/settings")) {
    const userRole = request.cookies.get("user-role")?.value || request.headers.get("x-user-role");

    // Block non-admins from settings routes
    if (userRole && userRole !== "ADMIN") {
      const dashboardUrl = new URL("/", request.url);
      dashboardUrl.searchParams.set("error", "unauthorized_admin_required");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/settings/:path*"],
};
EOF

# -----------------------------------------------------------------------------
# 3. Prisma Schema & Seed Script (Multi-Schema & Role-Task Matrix)
# -----------------------------------------------------------------------------

cat << 'EOF' > prisma/schema.prisma
datasource db {
  provider   = "postgresql"
  url        = env("DIRECT_URL")
  schemas    = ["macula"]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters", "multiSchema"]
}

model Organization {
  id                 String   @id @default(uuid())
  name               String
  slug               String   @unique
  brandingHex        String   @default("#0f766e")
  defaultDisclaimer  String   @default("Issued for clinical public health awareness. Does not constitute patient solicitation under NMC regulations.")
  customSystemPrompt String?  @db.Text
  createdAt          DateTime @default(now())

  users              User[]
  cases              Case[]
  roles              Role[]

  @@map("macula_organizations")
  @@schema("macula")
}

model Permission {
  id          String           @id @default(uuid())
  slug        String           @unique
  name        String
  module      String           // INGESTION, SAFETY_GATE, STUDIO, SETTINGS
  description String
  roles       RolePermission[]

  @@map("macula_permissions")
  @@schema("macula")
}

model Role {
  id             String           @id @default(uuid())
  name           String
  slug           String
  isSystem       Boolean          @default(false)
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  users          User[]
  permissions    RolePermission[]

  @@unique([slug, organizationId])
  @@map("macula_roles")
  @@schema("macula")
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@map("macula_role_permissions")
  @@schema("macula")
}

model User {
  id             String       @id @default(uuid())
  name           String
  email          String       @unique
  registrationNo String?
  specialty      String?
  organizationId String
  roleId         String
  createdAt      DateTime     @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  role           Role         @relation(fields: [roleId], references: [id])
  cases          Case[]

  @@map("macula_users")
  @@schema("macula")
}

model Case {
  id             String           @id @default(uuid())
  title          String
  rawInput       String
  masterRecord   Json
  safetyAudit    Json
  status         String           @default("PENDING_REVIEW")
  physicianId    String
  organizationId String
  createdAt      DateTime         @default(now())

  physician      User             @relation(fields: [physicianId], references: [id])
  organization   Organization     @relation(fields: [organizationId], references: [id])
  assets         GeneratedAsset[]

  @@map("macula_cases")
  @@schema("macula")
}

model GeneratedAsset {
  id        String   @id @default(uuid())
  caseId    String
  channel   String
  content   Json
  createdAt DateTime @default(now())

  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@map("macula_generated_assets")
  @@schema("macula")
}
EOF

cat << 'EOF' > prisma/seed.ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const UI_TASKS = [
  { slug: "CASE_INGEST_TEXT", name: "Paste / Dictate Raw OPD Notes", module: "INGESTION", description: "Input raw clinical narratives" },
  { slug: "CASE_SYNTHESIZE", name: "Trigger LLM Compliance Synthesis", module: "INGESTION", description: "Run regex and GPT-4o de-identification" },
  { slug: "SAFETY_GATE_VIEW", name: "View Redaction & Audit Manifest", module: "SAFETY_GATE", description: "Inspect detected PHI and flagged claims" },
  { slug: "SAFETY_GATE_APPROVE", name: "Sign-Off & Authorize Master Record", module: "SAFETY_GATE", description: "Physician legal sign-off on de-identified case" },
  { slug: "ASSET_VIEW_ALL", name: "View Generated Omnichannel Assets", module: "STUDIO", description: "View LinkedIn, Reel script, and Blog content" },
  { slug: "ASSET_EXPORT_LINKEDIN", name: "Copy / Publish Peer LinkedIn Post", module: "STUDIO", description: "Copy or schedule LinkedIn CME post" },
  { slug: "ASSET_EXPORT_PATIENT", name: "Publish Patient Education Notice", module: "STUDIO", description: "Export public-facing patient advice" },
  { slug: "PROMPT_MANAGE", name: "Configure Regulatory System Prompts", module: "SETTINGS", description: "Edit DPDP and NMC prompt guardrails" },
  { slug: "ROLE_MATRIX_MANAGE", name: "Update Role-Task Permission Matrix", module: "SETTINGS", description: "Modify database role matrix assignments" },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "manipal-retina" },
    update: {},
    create: {
      id: "DEMO_ORG_UUID",
      name: "Manipal Hospital Retina Institute",
      slug: "manipal-retina",
    },
  });

  for (const task of UI_TASKS) {
    await prisma.permission.upsert({
      where: { slug: task.slug },
      update: { name: task.name, module: task.module, description: task.description },
      create: task,
    });
  }

  const allPerms = await prisma.permission.findMany();
  const permMap = new Map(allPerms.map((p) => [p.slug, p.id]));

  const adminRole = await prisma.role.upsert({
    where: { slug_organizationId: { slug: "ADMIN", organizationId: org.id } },
    update: {},
    create: {
      name: "Hospital Administrator",
      slug: "ADMIN",
      isSystem: true,
      organizationId: org.id,
      permissions: {
        create: allPerms.map((p) => ({ permissionId: p.id })),
      },
    },
  });

  const doctorRole = await prisma.role.upsert({
    where: { slug_organizationId: { slug: "DOCTOR", organizationId: org.id } },
    update: {},
    create: {
      name: "Attending Consultant / RMP",
      slug: "DOCTOR",
      isSystem: true,
      organizationId: org.id,
      permissions: {
        create: [
          { permissionId: permMap.get("CASE_INGEST_TEXT")! },
          { permissionId: permMap.get("CASE_SYNTHESIZE")! },
          { permissionId: permMap.get("SAFETY_GATE_VIEW")! },
          { permissionId: permMap.get("SAFETY_GATE_APPROVE")! },
          { permissionId: permMap.get("ASSET_VIEW_ALL")! },
          { permissionId: permMap.get("ASSET_EXPORT_LINKEDIN")! },
          { permissionId: permMap.get("ASSET_EXPORT_PATIENT")! },
        ],
      },
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@hospital.in" },
    update: { roleId: adminRole.id },
    create: {
      id: "DEMO_ADMIN_UUID",
      name: "Medical Superintendent",
      email: "admin@hospital.in",
      roleId: adminRole.id,
      organizationId: org.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "doctor@hospital.in" },
    update: { roleId: doctorRole.id },
    create: {
      id: "DEMO_DOCTOR_UUID",
      name: "Dr. Priya Karthikeyan",
      email: "doctor@hospital.in",
      registrationNo: "KMC-78491",
      specialty: "Vitreoretinal Surgery",
      roleId: doctorRole.id,
      organizationId: org.id,
    },
  });

  console.log("Database initialized with organizations, permissions, and roles.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
EOF

# -----------------------------------------------------------------------------
# 4. Shared Libraries, DB Client, Prompts & Types
# -----------------------------------------------------------------------------

cat << 'EOF' > lib/types.ts
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
EOF

cat << 'EOF' > lib/prompts/compliance.ts
export const INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT = `
You are a Lead Clinical Data Officer, Medico-Legal Auditor, and Medical Communications Specialist operating within the Indian Healthcare Regulatory Framework.

Your mandate is to review raw clinical transcripts dictated by Registered Medical Practitioners (RMPs) in Indian hospitals and produce:
1. A statutory de-identification and medical ethics compliance audit.
2. A structured, CME-grade Master Clinical Content Record.

MANDATORY REGULATORY POLICIES:
1. DIGITAL PERSONAL DATA PROTECTION (DPDP) ACT & 18 SAFE HARBOR DE-IDENTIFICATION:
   - Identify, flag, and redact all individual and facility identifiers:
     • Patient Names, aliases, attendant/relative names.
     • Hospital Identifiers: UHID, OPD/IPD registration numbers, room/bed numbers.
     • National Identity: 14-digit ABHA ID, Aadhaar, PAN, Voter ID.
     • Insurance/Schemes: Ayushman Bharat (PM-JAY), CGHS, ECHS, TPA policy numbers.
     • Temporal Data: Redact calendar dates (e.g., "14th August"). Replace with clinical elapsed intervals ("baseline presentation", "post-op day 1", "4-week follow-up").
     • Geographic Data: Redact street names, localities (e.g., "Indiranagar", "Banjara Hills"), and 6-digit PIN codes. Preserve state/region only if clinically relevant to disease epidemiology.
     • Contact Data: Phone numbers and emails.

2. NMC ETHICS REGULATIONS (Registered Medical Practitioner Regulations):
   - Prohibit superlative self-promotion ("best retinal surgeon in Bengaluru", "unrivaled hospital").
   - Prohibit curative guarantees ("100% cure", "permanent vision recovery", "zero complications").
   - Prohibit commercial patient solicitation or pricing promotions.
   - Frame the entire narrative around clinical education, peer CME, or public health awareness.

3. DRUGS & MAGIC REMEDIES (OBJECTIONABLE ADVERTISEMENTS) ACT:
   - Prohibit curative claims for scheduled conditions (e.g., blindness, diabetic eye disease). State factual, observed outcomes only.

OUTPUT REQUIREMENTS:
- Adhere strictly to the requested JSON schema.
- In 'safetyAudit', list every identified violation, the snippet, and the remediation applied.
- In 'masterRecord', construct a clean, de-identified clinical synopsis.
`;
EOF

cat << 'EOF' > lib/db.ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export function getDb(): PrismaClient {
  if (globalThis.prismaGlobal) {
    return globalThis.prismaGlobal;
  }

  const connectionString =
    process.env.HYPERDRIVE_URL ||
    process.env.DIRECT_URL ||
    "postgresql://postgres:postgres@localhost:5432/macula";

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = client;
  }

  return client;
}

export const db = getDb();
EOF

cat << 'EOF' > lib/auth.ts
import { db } from "@/lib/db";
import { headers } from "next/headers";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  role: {
    id: string;
    name: string;
    slug: string;
  };
  permissions: string[];
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const incomingHeaders = await headers();
  const userId = incomingHeaders.get("x-user-id") || "DEMO_ADMIN_UUID";

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: {
      id: user.role.id,
      name: user.role.name,
      slug: user.role.slug,
    },
    permissions: user.role.permissions.map((rp) => rp.permission.slug),
  };
}

export async function requirePermission(permissionSlug: string): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user || !user.permissions.includes(permissionSlug)) {
    throw new Error(`FORBIDDEN_MISSING_PERMISSION:${permissionSlug}`);
  }

  return user;
}
EOF

# -----------------------------------------------------------------------------
# 5. Backend API Routes
# -----------------------------------------------------------------------------

cat << 'EOF' > app/api/cases/synthesize/route.ts
import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { MasterRecordSchema, SafetyReportSchema } from "@/lib/types";
import { INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT } from "@/lib/prompts/compliance";

const PATTERNS = {
  phone: /(?:(?:\+91|91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g,
  abha: /\b\d{2}-\d{4}-\d{4}-\d{4}\b|\b\d{14}\b/g,
  aadhaar: /\b[2-9]{1}\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  pinCode: /\b[1-8]\d{5}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

function runLocalIndianRegexGuards(text: string) {
  const localFlags: Array<{ category: string; flaggedSnippet: string; remediation: string }> = [];
  let sanitized = text;

  sanitized = sanitized.replace(PATTERNS.phone, (match) => {
    localFlags.push({
      category: "Indian Mobile Number (Deterministic Regex)",
      flaggedSnippet: match,
      remediation: "Redacted locally before network egress",
    });
    return "[PHONE_REDACTED]";
  });

  sanitized = sanitized.replace(PATTERNS.abha, (match) => {
    localFlags.push({
      category: "Ayushman Bharat ABHA ID (Deterministic Regex)",
      flaggedSnippet: match,
      remediation: "Redacted locally before network egress",
    });
    return "[ABHA_REDACTED]";
  });

  sanitized = sanitized.replace(PATTERNS.aadhaar, (match) => {
    localFlags.push({
      category: "Aadhaar Number (Deterministic Regex)",
      flaggedSnippet: match,
      remediation: "Redacted locally before network egress",
    });
    return "[AADHAAR_REDACTED]";
  });

  sanitized = sanitized.replace(PATTERNS.pinCode, (match) => {
    localFlags.push({
      category: "Postal PIN Code (Deterministic Regex)",
      flaggedSnippet: match,
      remediation: "Redacted locally before network egress",
    });
    return "[PIN_REDACTED]";
  });

  sanitized = sanitized.replace(PATTERNS.email, (match) => {
    localFlags.push({
      category: "Email Address (Deterministic Regex)",
      flaggedSnippet: match,
      remediation: "Redacted locally before network egress",
    });
    return "[EMAIL_REDACTED]";
  });

  return { sanitizedText: sanitized, localFlags };
}

export async function POST(req: Request) {
  try {
    const { text, organizationId = "DEMO_ORG_UUID" } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Clinical input is required." }, { status: 400 });
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { customSystemPrompt: true },
    });

    const activePrompt = org?.customSystemPrompt || INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT;
    const { sanitizedText, localFlags } = runLocalIndianRegexGuards(text);

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: z.object({
        safetyAudit: SafetyReportSchema,
        masterRecord: MasterRecordSchema,
      }),
      system: activePrompt,
      prompt: `Analyze and process the following clinical intake narrative:\n\n"""\n${sanitizedText}\n"""`,
    });

    const consolidatedAudit = {
      isCompliant: object.safetyAudit.isCompliant && localFlags.length === 0,
      phiDetected: [...localFlags, ...object.safetyAudit.phiDetected],
      unverifiedClaimsDetected: object.safetyAudit.unverifiedClaimsDetected,
    };

    return NextResponse.json({
      masterRecord: object.masterRecord,
      safetyAudit: consolidatedAudit,
    });
  } catch (error: any) {
    console.error("Synthesize error:", error);
    return NextResponse.json({ error: error.message || "Synthesis failed." }, { status: 500 });
  }
}
EOF

cat << 'EOF' > app/api/cases/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const cases = await db.case.findMany({
      orderBy: { createdAt: "desc" },
      include: { physician: true, organization: true },
      take: 20,
    });
    return NextResponse.json(cases);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rawInput, masterRecord, safetyAudit, physicianId, organizationId } = body;

    const newCase = await db.case.create({
      data: {
        title: masterRecord.primaryDiagnosis,
        rawInput,
        masterRecord,
        safetyAudit,
        status: "PENDING_REVIEW",
        physicianId,
        organizationId,
      },
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
EOF

cat << 'EOF' > app/api/cases/'[id]'/approve/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const AssetsSchema = z.object({
  linkedinPost: z.string(),
  patientEducation: z.string(),
  reelScript: z.string(),
  clinicalBlog: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingCase = await db.case.findUnique({
      where: { id },
      include: { physician: true, organization: true },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    const { object: generated } = await generateObject({
      model: openai("gpt-4o"),
      schema: AssetsSchema,
      prompt: `
Generate 4 compliance-approved healthcare marketing assets based solely on this verified clinical master record:
${JSON.stringify(existingCase.masterRecord, null, 2)}

Attending Doctor: Dr. ${existingCase.physician.name} (${existingCase.physician.registrationNo || "Reg on file"})
Organization: ${existingCase.organization.name}
Statutory Disclaimer: "${existingCase.organization.defaultDisclaimer}"

Asset Types:
1. linkedinPost: Peer-level clinical case discussion for medical peers.
2. patientEducation: Clear, compassionate guide explaining symptoms and modern interventions.
3. reelScript: 60-second video script with visual cues and voiceover.
4. clinicalBlog: 400-word educational article with medical takeaways.
`,
    });

    await db.$transaction([
      db.case.update({
        where: { id },
        data: { status: "APPROVED" },
      }),
      db.generatedAsset.createMany({
        data: [
          { caseId: id, channel: "LINKEDIN_CASE", content: { text: generated.linkedinPost } },
          { caseId: id, channel: "PATIENT_EDUCATION", content: { text: generated.patientEducation } },
          { caseId: id, channel: "SCRIPT_60S", content: { text: generated.reelScript } },
          { caseId: id, channel: "CLINICAL_BLOG", content: { text: generated.clinicalBlog } },
        ],
      }),
    ]);

    return NextResponse.json({ success: true, caseId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
EOF

cat << 'EOF' > app/api/settings/prompt/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, getCurrentUser } from "@/lib/auth";
import { INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT } from "@/lib/prompts/compliance";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const orgId = user?.organizationId || "DEMO_ORG_UUID";

    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { customSystemPrompt: true },
    });

    return NextResponse.json({
      activePrompt: org?.customSystemPrompt || INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT,
      isCustom: Boolean(org?.customSystemPrompt),
      defaultPrompt: INDIAN_HOSPITAL_COMPLIANCE_SYSTEM_PROMPT,
      canEdit: user?.permissions.includes("PROMPT_MANAGE") ?? false,
      roleName: user?.role.name || "Guest",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requirePermission("PROMPT_MANAGE");
    const { prompt, resetToDefault } = await req.json();

    const updated = await db.organization.update({
      where: { id: user.organizationId },
      data: {
        customSystemPrompt: resetToDefault ? null : prompt,
      },
    });

    return NextResponse.json({
      success: true,
      customSystemPrompt: updated.customSystemPrompt,
      updatedBy: user.email,
    });
  } catch (error: any) {
    const status = error.message?.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
EOF

cat << 'EOF' > app/api/settings/roles/matrix/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const orgId = user?.organizationId || "DEMO_ORG_UUID";

    const [roles, permissions] = await Promise.all([
      db.role.findMany({
        where: { organizationId: orgId },
        include: {
          permissions: {
            select: { permissionId: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      db.permission.findMany({
        orderBy: [{ module: "asc" }, { name: "asc" }],
      }),
    ]);

    const matrix: Record<string, string[]> = {};
    roles.forEach((r) => {
      matrix[r.id] = r.permissions.map((p) => p.permissionId);
    });

    return NextResponse.json({
      roles: roles.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
      permissions,
      matrix,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requirePermission("ROLE_MATRIX_MANAGE");
    const { roleId, permissionId, enabled } = await req.json();

    if (!roleId || !permissionId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Missing toggle parameters." }, { status: 400 });
    }

    if (enabled) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    } else {
      await db.rolePermission.deleteMany({
        where: { roleId, permissionId },
      });
    }

    return NextResponse.json({ success: true, roleId, permissionId, enabled });
  } catch (error: any) {
    const status = error.message?.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
EOF

# -----------------------------------------------------------------------------
# 6. Frontend Layouts and Views
# -----------------------------------------------------------------------------

cat << 'EOF' > app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

cat << 'EOF' > app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macula Healthcare | Clinical Compliance & Synthesis",
  description: "NMC & DPDP Compliant Clinical Automation for Indian Hospitals",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const canManagePrompts = user?.permissions.includes("PROMPT_MANAGE");
  const canManageRoles = user?.permissions.includes("ROLE_MATRIX_MANAGE");

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen font-sans">
        <header className="border-b bg-white sticky top-0 z-30 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-teal-800 tracking-tight flex items-center gap-2">
              <span className="bg-teal-700 text-white rounded p-1 text-xs">MH</span>
              MACULA <span className="text-slate-500 font-normal">HEALTHCARE</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-teal-700 transition-colors">Dashboard</Link>
              <Link href="/cases/new" className="hover:text-teal-700 transition-colors">+ New Clinical Case</Link>
              {canManagePrompts && (
                <Link href="/settings/prompts" className="hover:text-teal-700 transition-colors">
                  Compliance Prompt
                </Link>
              )}
              {canManageRoles && (
                <Link href="/settings/roles" className="text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md text-xs font-semibold hover:bg-teal-100 transition-colors">
                  Role Matrix
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
EOF

cat << 'EOF' > app/page.tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cases = await db.case.findMany({
    orderBy: { createdAt: "desc" },
    include: { physician: true },
  });

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clinical Case Hub</h1>
          <p className="text-sm text-slate-600">DPDP & NMC Compliance Pipeline for Indian Hospitals</p>
        </div>
        <Link
          href="/cases/new"
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusCircle className="w-4 h-4" /> New Case Intake
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
            <tr>
              <th className="py-3 px-4">Primary Diagnosis / Title</th>
              <th className="py-3 px-4">Attending Clinician</th>
              <th className="py-3 px-4">Compliance Status</th>
              <th className="py-3 px-4">Created Date</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-600">
            {cases.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No cases ingested yet. Click "+ New Case Intake" to start.
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-900">{c.title}</td>
                  <td className="py-3 px-4">Dr. {c.physician.name}</td>
                  <td className="py-3 px-4">
                    {c.status === "APPROVED" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" /> Pending Review
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={c.status === "APPROVED" ? `/cases/${c.id}/assets` : `/cases/${c.id}/review`}
                      className="text-teal-700 hover:underline font-medium text-xs"
                    >
                      {c.status === "APPROVED" ? "View Assets →" : "Review Safety Gate →"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > app/cases/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Sparkles, Loader2 } from "lucide-react";

export default function ClinicalIngestionPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSynthesize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cases/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, organizationId: "DEMO_ORG_UUID" }),
      });

      if (!res.ok) throw new Error("Synthesis and compliance scan failed.");
      const { masterRecord, safetyAudit } = await res.json();

      const saveRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: text,
          masterRecord,
          safetyAudit,
          physicianId: "DEMO_DOCTOR_UUID",
          organizationId: "DEMO_ORG_UUID",
        }),
      });

      const savedCase = await saveRes.json();
      router.push(`/cases/${savedCase.id}/review`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Clinical Ingestion Studio</h1>
        <p className="text-sm text-slate-600">
          Paste or dictate clinical notes. Content will undergo deterministic regex sanitization and an LLM compliance audit under DPDP & NMC regulations.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <label className="block text-sm font-semibold text-slate-800">
          Raw OPD Case Transcript / Surgical Log
        </label>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes with UHID, phone, symptoms, examination, anti-VEGF injection, and follow-up vision status..."
          className="w-full border rounded-lg p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono text-sm"
        />

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSynthesize}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Auditing & Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Compliance Scan & Synthesize</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > app/cases/'[id]'/review/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

export default function SafetyGatePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [caseData, setCaseData] = useState<any>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetch(`/api/cases`)
      .then((res) => res.json())
      .then((cases) => {
        const found = cases.find((c: any) => c.id === id);
        if (found) setCaseData(found);
      });
  }, [id]);

  if (!caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading compliance audit...
      </div>
    );
  }

  const { masterRecord, safetyAudit } = caseData;
  const totalFlags = safetyAudit.phiDetected.length + safetyAudit.unverifiedClaimsDetected.length;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/cases/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Approval failed.");
      router.push(`/cases/${id}/assets`);
    } catch (err) {
      alert("Failed to approve case and generate assets.");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Screen 3: Statutory Safety Gate</h1>
          <p className="text-sm text-slate-600 font-mono text-xs mt-0.5">Case ID: {id}</p>
        </div>
        <div>
          {safetyAudit.isCompliant ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-semibold rounded-full">
              <CheckCircle className="w-4 h-4" /> DPDP & Safe Harbor Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-sm font-semibold rounded-full">
              <AlertTriangle className="w-4 h-4" /> {totalFlags} Items Sanitized / Redacted
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Audit Manifest: Neutralized Identifiers & Claims</h2>
        <div className="divide-y text-sm">
          {safetyAudit.phiDetected.map((phi: any, idx: number) => (
            <div key={idx} className="py-3 flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                  {phi.category}
                </span>
                <p className="font-mono text-slate-700 mt-1 line-through">{phi.flaggedSnippet}</p>
              </div>
              <div className="text-right text-slate-600 text-xs">
                <span className="font-semibold text-emerald-700">Remediation:</span> {phi.remediation}
              </div>
            </div>
          ))}

          {safetyAudit.unverifiedClaimsDetected.map((claim: any, idx: number) => (
            <div key={idx} className="py-3 flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  {claim.category}
                </span>
                <p className="font-mono text-slate-700 mt-1 line-through">{claim.flaggedSnippet}</p>
              </div>
              <div className="text-right text-slate-600 text-xs max-w-sm">
                <span className="font-semibold text-emerald-700">Action:</span> {claim.remediation}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Approved Master Clinical Record</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold text-slate-700">Primary Diagnosis:</span>
            <p className="text-slate-900">{masterRecord.primaryDiagnosis}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-700">Specialty:</span>
            <p className="text-slate-900">{masterRecord.specialty}</p>
          </div>
          <div className="md:col-span-2">
            <span className="font-semibold text-slate-700">Clinical Hook:</span>
            <p className="text-slate-900 italic">"{masterRecord.clinicalHook}"</p>
          </div>
          <div className="md:col-span-2">
            <span className="font-semibold text-slate-700">Clinical Dilemma & Presentation:</span>
            <p className="text-slate-900">{masterRecord.diagnosticDilemma}</p>
          </div>
          <div className="md:col-span-2">
            <span className="font-semibold text-slate-700">Procedure / Intervention:</span>
            <p className="text-slate-900">{masterRecord.procedureOrIntervention}</p>
          </div>
          <div className="md:col-span-2">
            <span className="font-semibold text-slate-700">Observed Clinical Outcome:</span>
            <p className="text-slate-900">{masterRecord.clinicalOutcome}</p>
          </div>
          <div className="md:col-span-2">
            <span className="font-semibold text-slate-700">CME Takeaway:</span>
            <p className="text-slate-900">{masterRecord.coreEducationalMessage}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-3 px-8 rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {approving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Authorizing & Generating Assets...</span>
            </>
          ) : (
            <>
              <span>Sign-Off & Generate All Deliverables</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > app/cases/'[id]'/assets/page.tsx
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Copy, CheckCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AssetStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const currentCase = await db.case.findUnique({
    where: { id },
    include: {
      assets: true,
      physician: true,
      organization: true,
    },
  });

  if (!currentCase) notFound();

  const channelTitles: Record<string, string> = {
    LINKEDIN_CASE: "Peer-to-Peer Clinical Post (LinkedIn)",
    PATIENT_EDUCATION: "Patient Awareness & Guide (Meta / Web)",
    SCRIPT_60S: "60-Second Short Form Script (Reels / Shorts)",
    CLINICAL_BLOG: "Clinical Editorial & CME Digest (SEO Blog)",
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Omnichannel Asset Studio</h1>
          <p className="text-sm text-slate-600">
            Case: {currentCase.title} | Treating Clinician: Dr. {currentCase.physician.name} ({currentCase.physician.registrationNo || "Reg on file"})
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-teal-100 text-teal-800 text-xs font-semibold rounded-full">
          <CheckCircle className="w-3.5 h-3.5" /> All Assets Signed-Off
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {currentCase.assets.map((asset) => (
          <div key={asset.id} className="bg-white border rounded-xl shadow-sm flex flex-col justify-between">
            <div className="p-5 border-b bg-slate-50/50 flex items-center justify-between">
              <span className="font-semibold text-slate-800 text-sm">
                {channelTitles[asset.channel] || asset.channel}
              </span>
            </div>
            <div className="p-5 flex-1">
              <pre className="text-xs font-sans text-slate-700 whitespace-pre-wrap leading-relaxed">
                {(asset.content as any).text}
              </pre>
            </div>
            <div className="p-4 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Verified Safe Harbor & NMC compliant</span>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-medium transition-colors">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > app/settings/prompts/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Save, RotateCcw, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function AdminPromptSettingsPage() {
  const [promptText, setPromptText] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/prompt")
      .then((res) => res.json())
      .then((data) => {
        setPromptText(data.activePrompt);
        setDefaultPrompt(data.defaultPrompt);
        setIsCustom(data.isCustom);
        setCanEdit(data.canEdit);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, resetToDefault: false }),
      });
      if (!res.ok) throw new Error("Failed to save prompt.");
      setIsCustom(true);
      setStatusMessage("Compliance system prompt updated in database.");
    } catch (err: any) {
      setStatusMessage(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Revert to statutory Indian DPDP and NMC base prompt?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToDefault: true }),
      });
      if (!res.ok) throw new Error("Failed to reset.");
      setPromptText(defaultPrompt);
      setIsCustom(false);
      setStatusMessage("Reverted to base regulatory prompt.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading prompt configuration...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance Prompt Configuration</h1>
          <p className="text-sm text-slate-600">
            Configure system prompt instructions for statutory de-identification and clinical synthesis.
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isCustom ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isCustom ? "Custom Policy Active" : "Default Statutory Policy"}
        </span>
      </div>

      {statusMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-800">Prompt Instructions</label>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={saving || !isCustom}
                className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Revert to Default
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          )}
        </div>

        <textarea
          rows={22}
          value={promptText}
          readOnly={!canEdit}
          onChange={(e) => setPromptText(e.target.value)}
          className={`w-full border rounded-lg p-3 text-slate-800 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-teal-600 focus:outline-none ${
            !canEdit ? "bg-slate-50 cursor-not-allowed" : ""
          }`}
        />

        <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <span>
            <strong>Statutory Notice:</strong> Local regex filters (phone numbers, ABHA IDs, Aadhaar, PIN codes) execute deterministically prior to LLM submission regardless of prompt modifications.
          </span>
        </div>
      </div>
    </div>
  );
}
EOF

cat << 'EOF' > app/settings/roles/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Check, Shield, AlertCircle, Loader2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
  slug: string;
}

interface TaskPermission {
  id: string;
  slug: string;
  name: string;
  module: string;
  description: string;
}

export default function RoleTaskMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<TaskPermission[]>([]);
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/roles/matrix")
      .then((res) => res.json())
      .then((data) => {
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
        setMatrix(data.matrix || {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (roleId: string, permissionId: string) => {
    const isCurrentlyEnabled = matrix[roleId]?.includes(permissionId) ?? false;
    const nextState = !isCurrentlyEnabled;
    const key = `${roleId}-${permissionId}`;

    setUpdatingKey(key);
    setError(null);

    setMatrix((prev) => {
      const currentPerms = prev[roleId] || [];
      const updatedPerms = nextState
        ? [...currentPerms, permissionId]
        : currentPerms.filter((id) => id !== permissionId);
      return { ...prev, [roleId]: updatedPerms };
    });

    try {
      const res = await fetch("/api/settings/roles/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, permissionId, enabled: nextState }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update matrix in database.");
      }
    } catch (err: any) {
      setError(err.message);
      setMatrix((prev) => {
        const currentPerms = prev[roleId] || [];
        const reverted = isCurrentlyEnabled
          ? [...currentPerms, permissionId]
          : currentPerms.filter((id) => id !== permissionId);
        return { ...prev, [roleId]: reverted };
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading role-task matrix from RDS...
      </div>
    );
  }

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Role-Task Permission Matrix</h1>
          <p className="text-sm text-slate-600">
            Dynamically configure and audit which clinical roles are authorized to execute actions in the database.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full">
          <Shield className="w-3.5 h-3.5" /> Enforced in PostgreSQL
        </span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-700">
              <th className="py-3 px-4 font-semibold w-1/3">Clinical UI Action / Task</th>
              {roles.map((role) => (
                <th key={role.id} className="py-3 px-4 font-semibold text-center border-l">
                  {role.name}
                  <span className="block text-xs font-normal text-slate-400 font-mono mt-0.5">
                    {role.slug}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y text-slate-600">
            {modules.map((mod) => (
              <React.Fragment key={mod}>
                <tr className="bg-slate-100/60 font-bold text-xs uppercase tracking-wider text-slate-500">
                  <td colSpan={roles.length + 1} className="py-2 px-4">
                    {mod} Operations
                  </td>
                </tr>
                {permissions
                  .filter((p) => p.module === mod)
                  .map((perm) => (
                    <tr key={perm.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{perm.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{perm.slug}</div>
                      </td>
                      {roles.map((role) => {
                        const isChecked = matrix[role.id]?.includes(perm.id) ?? false;
                        const isBusy = updatingKey === `${role.id}-${perm.id}`;

                        return (
                          <td key={role.id} className="py-3 px-4 text-center border-l">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggle(role.id, perm.id)}
                              className={`w-6 h-6 inline-flex items-center justify-center rounded border transition-colors ${
                                isChecked
                                  ? "bg-teal-700 border-teal-700 text-white"
                                  : "border-slate-300 bg-white hover:border-slate-400"
                              } ${isBusy ? "opacity-50" : ""}`}
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                              ) : isChecked ? (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF

echo "All components successfully written into ./${PROJECT_NAME}."
