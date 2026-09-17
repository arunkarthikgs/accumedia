"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import FileText from "lucide-react/dist/esm/icons/file-text";
import ImageIcon from "lucide-react/dist/esm/icons/image";
import PublishingAssetWorkspace from "@/components/PublishingAssetWorkspace";

const ImagesPanel = dynamic(() => import("@/components/ImagesPanel"), {
  loading: () => <div className="h-32 animate-pulse rounded-lg border border-line bg-surface" />,
});

type Asset = {
  id: string;
  channelKey: string;
  channelName: string;
  outputType: string | null;
  variant?: string | null;
  status: string;
  version: number;
  content: unknown;
  videoR2Key?: string | null;
  videoDurationSeconds?: number | null;
  videoStatus?: string | null;
};

export default function PublishingContentTabs({ caseId, assets, mccrApproved }: { caseId: string; assets: Asset[]; mccrApproved: boolean }) {
  const [activeTab, setActiveTab] = useState<"assets" | "images">("assets");

  return <section>
    <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Publishing content">
      <button type="button" role="tab" aria-selected={activeTab === "assets"} onClick={() => setActiveTab("assets")} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === "assets" ? "border-pine text-pine-dark" : "border-transparent text-muted hover:text-ink"}`}><FileText className="h-4 w-4" /> Publishing assets <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted">{assets.length}</span></button>
      <button type="button" role="tab" aria-selected={activeTab === "images"} onClick={() => setActiveTab("images")} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${activeTab === "images" ? "border-pine text-pine-dark" : "border-transparent text-muted hover:text-ink"}`}><ImageIcon className="h-4 w-4" /> Images</button>
    </div>
    <div className="pt-5">
      {activeTab === "assets" ? assets.length > 0 ? <PublishingAssetWorkspace caseId={caseId} assets={assets} /> : <div className="rounded-lg border border-dashed border-line bg-surface p-12 text-center"><FileText className="mx-auto h-9 w-9 text-muted" strokeWidth={1.5} /><p className="mt-3 text-sm font-medium text-ink">No publishing assets compiled yet</p><p className="mt-1 text-xs text-muted">Approve the clinical record, then generate assets from this studio.</p></div> : <ImagesPanel caseId={caseId} mccrApproved={mccrApproved} />}
    </div>
  </section>;
}