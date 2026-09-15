"use client";

import { useState } from "react";
import AssetActionsPanel from "@/components/AssetActionsPanel";

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

function runtimeSeconds(asset: Asset) {
  const value = asset.variant || asset.channelKey;
  const match = value.match(/(\d+)\s*(second|sec|minute|min)/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return /minute|min/i.test(match[2]) ? Number(match[1]) * 60 : Number(match[1]);
}

export default function PublishingAssetWorkspace({ caseId, assets }: { caseId: string; assets: Asset[] }) {
  const videoAssets = assets.filter((asset) => asset.outputType === "VIDEO_SCRIPT").sort((left, right) => runtimeSeconds(left) - runtimeSeconds(right));
  const otherAssets = assets.filter((asset) => asset.outputType !== "VIDEO_SCRIPT");
  const orderedAssets = [...videoAssets, ...otherAssets];
  const [selectedAssetId, setSelectedAssetId] = useState(orderedAssets[0]?.id || "");
  const selectedAsset = orderedAssets.find((asset) => asset.id === selectedAssetId) || orderedAssets[0];
  const assetsByStatus = assets.reduce((counts: Record<string, number>, asset) => {
    counts[asset.status] = (counts[asset.status] || 0) + 1;
    return counts;
  }, {});
  const assetsByType = assets.reduce((counts: Record<string, number>, asset) => {
    const label = asset.outputType?.replaceAll("_", " ") || asset.channelName;
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});

  if (!selectedAsset) return null;

  const assetButton = (asset: Asset) => {
    const selected = asset.id === selectedAsset.id;
    return <button key={asset.id} type="button" onClick={() => setSelectedAssetId(asset.id)} className={`min-w-40 rounded border px-3 py-2 text-left text-xs transition lg:min-w-0 ${selected ? "border-pine bg-pine-tint text-pine-dark" : "border-transparent text-ink hover:border-line hover:bg-paper"}`}>
      <span className="block truncate font-semibold">{asset.channelName || asset.channelKey}</span>
      <span className="mt-0.5 block text-[10px] text-muted">{asset.variant || asset.status.toLowerCase().replaceAll("_", " ")} · v{asset.version}</span>
    </button>;
  };

  return <div className="space-y-5">
    <section className="rounded-lg border border-line bg-surface p-5" aria-label="Generated asset summary">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-sm font-bold text-ink">Generated assets</h2><p className="mt-1 text-xs text-muted">{assets.length} publication assets are ready for review.</p></div>
        <div className="flex flex-wrap gap-2 text-xs">{(Object.entries(assetsByStatus) as [string, number][]).map(([status, count]) => <button key={status} type="button" onClick={() => setSelectedAssetId(orderedAssets.find((asset) => asset.status === status)?.id || selectedAsset.id)} className={status === "APPROVED" ? "rounded bg-sage-tint px-2.5 py-1 font-semibold text-sage hover:ring-1 hover:ring-sage/40" : status === "REVIEW" ? "rounded bg-ochre-tint px-2.5 py-1 font-semibold text-ochre hover:ring-1 hover:ring-ochre/40" : "rounded bg-paper px-2.5 py-1 font-semibold text-muted hover:ring-1 hover:ring-line"}>{count} {status.toLowerCase().replaceAll("_", " ")}</button>)}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {(Object.entries(assetsByType) as [string, number][]).map(([type, count]) => <button key={type} type="button" onClick={() => setSelectedAssetId(orderedAssets.find((asset) => (asset.outputType?.replaceAll("_", " ") || asset.channelName) === type)?.id || selectedAsset.id)} className="rounded border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink hover:border-pine hover:text-pine">{type} <span className="text-muted">({count})</span></button>)}
      </div>
    </section>
    <section className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
    <nav aria-label="Generated assets" className="rounded-lg border border-line bg-surface p-3 lg:sticky lg:top-4 lg:self-start">
      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Choose an asset</p>
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {videoAssets.length > 0 && <div className="flex gap-2 lg:flex-col"><p className="hidden px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-pine lg:block">Video scripts</p>{videoAssets.map(assetButton)}</div>}
        {otherAssets.length > 0 && <div className="flex gap-2 lg:flex-col"><p className="hidden border-t border-line px-2 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted lg:block">Other assets</p>{otherAssets.map(assetButton)}</div>}
      </div>
    </nav>
    <AssetActionsPanel key={selectedAsset.id} caseId={caseId} asset={selectedAsset} />
    </section>
  </div>;
}