import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ArrowLeft, Share2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CaseAssetsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const caseData = await db.case.findUnique({
    where: { id },
    include: {
      physician: true,
      organization: true,
      assets: true,
    },
  });

  if (!caseData) notFound();

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <Link href="/" className="flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <span>/</span>
            <Link href={`/cases/${caseData.id}/review`} className="hover:underline">
              Audit Review
            </Link>
            <span>/</span>
            <span>Studio</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Omnichannel Publishing Studio
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-4 w-4" /> Signed-Off by Physician
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Clinical case: <strong className="text-slate-800">{caseData.title}</strong>
          </p>
        </div>

        {caseData.assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Share2 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No assets generated yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Approve this case in the audit view to trigger asset compilation.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {caseData.assets.map((asset) => {
              const contentObj = asset.content as Record<string, any>;

              return (
                <div
                  key={asset.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800 border border-teal-200">
                        {asset.channelName || asset.channelKey}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {asset.channelKey}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 border border-slate-200 whitespace-pre-wrap">
                    {typeof contentObj === "object"
                      ? JSON.stringify(contentObj, null, 2)
                      : String(contentObj)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
