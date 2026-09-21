"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";

interface PublicationStatsModalProps {
  jobId: string;
  platform: string;
  onClose: () => void;
}

type StatRow = {
  id: string;
  status: "OK" | "UNSUPPORTED" | "ERROR";
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  videoViews: number | null;
  errorMessage: string | null;
  fetchedAt: string;
};

const METRIC_LABELS: Array<[keyof StatRow, string]> = [
  ["impressions", "Impressions"],
  ["videoViews", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["clicks", "Clicks"],
];

const METRIC_COLORS: Record<string, string> = {
  impressions: "#1f5c4f",
  videoViews: "#1f5c4f",
  likes: "#2f6f4e",
  comments: "#9c6b25",
  shares: "#8b3a3a",
  clicks: "#3b6ea5",
};

const CHART_WIDTH = 560;
const CHART_HEIGHT = 160;
const CHART_PADDING = 24;

function TrendChart({ stats }: { stats: StatRow[] }) {
  // Chart wants oldest -> newest, left to right; API returns newest first.
  const chronological = [...stats].filter((row) => row.status === "OK").reverse();
  const series = METRIC_LABELS
    .filter(([key]) => chronological.some((row) => row[key] != null))
    .map(([key, label]) => ({ key, label, color: METRIC_COLORS[key], values: chronological.map((row) => Number(row[key] ?? 0)) }));

  if (chronological.length < 2 || series.length === 0) {
    return <p className="text-xs text-muted">Not enough data points yet to plot a trend. Check back after another poll.</p>;
  }

  const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const xFor = (index: number) => CHART_PADDING + (index / (chronological.length - 1)) * innerWidth;

  return (
    <div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" role="img" aria-label="Engagement trend chart">
        <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="#e9ecef" strokeWidth={1} />
        {series.map(({ key, color, values }) => {
          const max = Math.max(...values, 1);
          const yFor = (value: number) => CHART_HEIGHT - CHART_PADDING - (value / max) * innerHeight;
          const points = values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
          return (
            <g key={key}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {values.map((value, index) => (
                <circle key={index} cx={xFor(index)} cy={yFor(value)} r={2.5} fill={color}>
                  <title>{`${formatDateTime(chronological[index].fetchedAt)}: ${value.toLocaleString()}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {series.map(({ key, label, color, values }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {label} · {values[values.length - 1].toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PublicationStatsModal({ jobId, platform, onClose }: PublicationStatsModalProps) {
  const [stats, setStats] = useState<StatRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin/publishing/${jobId}/stats`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load stats history.");
        if (!cancelled) setStats(data.stats || []);
      } catch (loadError: any) {
        if (!cancelled) setError(loadError.message || "Unable to load stats history.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const latest = stats[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-sm font-bold capitalize text-ink">{platform} engagement stats</h3>
            <p className="mt-0.5 text-[11px] text-muted">Snapshot history pulled from the platform API</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-paper hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />
              Loading stats…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-sm text-brick">{error}</div>
          ) : stats.length === 0 ? (
            <p className="text-sm text-muted">No stats have been captured for this job yet. They're polled roughly once an hour after publishing.</p>
          ) : (
            <div className="space-y-6">
              {latest && latest.status === "OK" && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {METRIC_LABELS.filter(([key]) => latest[key] != null).map(([key, label]) => (
                    <div key={key} className="rounded-lg border border-line bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                      <p className="mt-1 text-lg font-bold text-ink">{Number(latest[key]).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
              {latest && latest.status !== "OK" && (
                <div className="rounded-lg border border-brick/30 bg-brick-tint p-3 text-xs text-brick">
                  {latest.status === "UNSUPPORTED" ? "Stats are not supported for this connection." : "The last stats fetch failed."}
                  {latest.errorMessage ? ` ${latest.errorMessage}` : ""}
                </div>
              )}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Trend</p>
                <TrendChart stats={stats} />
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">History</p>
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1 pr-3">Fetched</th>
                      <th className="py-1 pr-3">Status</th>
                      {METRIC_LABELS.map(([key, label]) => (
                        <th key={key} className="py-1 pr-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {stats.map((row) => (
                      <tr key={row.id}>
                        <td className="py-1.5 pr-3 text-muted">{formatDateTime(row.fetchedAt)}</td>
                        <td className="py-1.5 pr-3 text-ink">{row.status}</td>
                        {METRIC_LABELS.map(([key]) => (
                          <td key={key} className="py-1.5 pr-3 text-ink">{row[key] != null ? Number(row[key]).toLocaleString() : "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
