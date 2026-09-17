import Link from "next/link";
import { query } from "@/lib/worker-db";
import { requireOrganizationAccess } from "@/lib/tenant-auth";
import PublishingContentTabs from "@/components/PublishingContentTabs";
import {
  ArrowLeft,
  Share2,
  ShieldCheck,
  Clock,
  PlusCircle,
  Building2,
  Stethoscope,
} from "lucide-react";
import StatusTag from "@/components/ui/StatusTag";
import GenerateAssetsButton from "@/components/GenerateAssetsButton";

export const dynamic = "force-dynamic";

export default async function CaseAssetsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let caseData: any = null;
  let dbError: string | null = null;

  try {
    const { rows } = await query<any>(`
      SELECT c.id, c.title, c.status, c."organizationId", c.mccr_approved_at AS "mccrApprovedAt",
             json_build_object('name', u.name, 'specialty', u.specialty) AS physician,
             json_build_object('name', o.name) AS organization,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', ga.id,
                 'channelKey', ga."channelKey",
                 'channelName', ga."channelName",
                 'outputType', ga."outputType",
                 'variant', ga.variant,
                 'status', ga.status,
                 'version', ga.version,
                 'content', ga.content,
                 'videoR2Key', ga."videoR2Key",
                 'videoDurationSeconds', ga."videoDurationSeconds",
                 'videoStatus', ga."videoStatus"
               ) ORDER BY ga."createdAt" DESC)
               FROM macula.generated_assets ga
               WHERE ga."caseId" = c.id
             ), '[]'::json) AS assets
      FROM macula.cases c
      JOIN macula.users u ON u.id = c."physicianId"
      JOIN macula.organizations o ON o.id = c."organizationId"
      WHERE c.id = $1
      LIMIT 1`, [id]);
    caseData = rows[0] || null;
    if (caseData) await requireOrganizationAccess(caseData.organizationId);
  } catch (err: any) {
    console.error("Failed to load case data:", err);
    dbError = err.message || "Failed to retrieve case records.";
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-paper p-8 text-ink flex items-center justify-center">
        <div className="max-w-md w-full card p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded bg-pine-tint text-pine mb-4">
            <Share2 className="h-5 w-5" />
          </div>
          <h2 className="font-serif text-lg font-semibold text-ink mb-1">Case not found</h2>
          <p className="text-xs text-muted mb-6 leading-relaxed">
            {dbError ? `Database notice: ${dbError}` : "The selected clinical case could not be found."}
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/cases/new" className="flex items-center justify-center gap-2 rounded bg-pine px-4 py-2.5 text-xs font-medium text-white hover:bg-pine-dark transition">
              <PlusCircle className="h-4 w-4" /> Start a new case
            </Link>
            <Link href="/" className="flex items-center justify-center gap-2 rounded border border-line bg-surface px-4 py-2.5 text-xs font-medium text-ink hover:border-pine transition">
              <ArrowLeft className="h-4 w-4" /> Return to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isApproved = caseData.status === "APPROVED";

  return (
    <div className="min-h-screen bg-paper p-8 text-ink">
      <div className="max-w-[1440px] space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <Link href="/" className="flex items-center gap-1 hover:text-pine">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <span>/</span>
            <Link href={`/cases/${caseData.id}/review`} className="hover:text-pine">Audit review</Link>
            <span>/</span>
            <span className="text-ink">Publishing studio</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">Publishing Studio</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {caseData.organization?.name || "Hospital network"}</span>
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3.5 w-3.5" />
                  {caseData.physician?.name || "Attending RMP"}
                  {caseData.physician?.specialty && <span className="text-muted/70"> ({caseData.physician.specialty})</span>}
                </span>
              </div>
            </div>

            {isApproved ? (
              <div className="flex flex-col items-end gap-2"><StatusTag tone="sage" icon={<ShieldCheck className="h-3.5 w-3.5" />}>Signed off by attending RMP</StatusTag><GenerateAssetsButton caseId={caseData.id} /></div>
            ) : (
              <StatusTag tone="ochre" icon={<Clock className="h-3.5 w-3.5" />}>Pending safety gate sign-off</StatusTag>
            )}
          </div>

          <div className="mt-4 card p-3 text-xs text-ink">
            <span className="font-medium text-muted">Clinical case title — </span>{caseData.title}
          </div>
        </div>

        <PublishingContentTabs caseId={caseData.id} assets={caseData.assets} mccrApproved={Boolean(caseData.mccrApprovedAt)} />
      </div>
    </div>
  );
}
