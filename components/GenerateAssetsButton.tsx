"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

type Channel = {
  channelKey: string;
  displayName: string;
  outputType: string;
  durationLabel: string | null;
  alreadyGenerated: boolean;
};

export default function GenerateAssetsButton({ caseId }: { caseId: string }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const openPicker = async () => {
    setIsPickerOpen(true);
    setMessage(null);
    setIsLoadingChannels(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/assets/generate`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load publishing asset options.");
      const loaded: Channel[] = data.channels || [];
      setChannels(loaded);
      setSelected(new Set(loaded.filter((channel) => !channel.alreadyGenerated).map((channel) => channel.channelKey)));
    } catch (error: any) {
      setIsError(true);
      setMessage(error.message || "Unable to load publishing asset options.");
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const toggleChannel = (channelKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(channelKey)) next.delete(channelKey);
      else next.add(channelKey);
      return next;
    });
  };

  const missingChannels = channels.filter((channel) => !channel.alreadyGenerated);
  const selectAllMissing = () => setSelected(new Set(missingChannels.map((channel) => channel.channelKey)));
  const selectNone = () => setSelected(new Set());

  const generate = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    try {
      const response = await fetch(`/api/cases/${caseId}/assets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKeys: Array.from(selected) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setIsError(true);
        setMessage(data.error || "Unable to generate publishing assets.");
        return;
      }
      setMessage(`${data.assetsGenerated} publishing asset${data.assetsGenerated === 1 ? "" : "s"} generated.`);
      setIsPickerOpen(false);
      window.dispatchEvent(new CustomEvent("publishing-assets-generated", { detail: data.assets || [] }));
    } catch (error: any) {
      setIsError(true);
      setMessage(error.message || "Unable to connect to the publishing asset service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={openPicker}
        className="flex items-center gap-1.5 rounded bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate Assets
      </button>
      {message && !isPickerOpen && (
        <div
          role={isError ? "alert" : "status"}
          className={`max-w-md rounded border px-3 py-2 text-xs font-medium ${isError ? "border-brick/30 bg-brick-tint text-brick" : "border-sage/30 bg-sage-tint text-sage"}`}
        >
          {message}
        </div>
      )}

      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-ink">Select publishing assets</h3>
                <p className="mt-0.5 text-[11px] text-muted">Choose one, a few, or all channels to generate.</p>
              </div>
              <button onClick={() => setIsPickerOpen(false)} className="rounded p-1 text-muted hover:bg-paper hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoadingChannels ? (
                <div className="py-8 text-center text-sm text-muted">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-pine" />
                  Loading channels…
                </div>
              ) : channels.length === 0 ? (
                <p className="text-xs text-muted">No publishing channels are configured for this hospital.</p>
              ) : (
                <>
                  <div className="mb-3 flex gap-3 text-[11px] font-semibold text-pine">
                    <button onClick={selectAllMissing} className="hover:underline">Select all missing</button>
                    <button onClick={selectNone} className="hover:underline">Select none</button>
                  </div>
                  <ul className="space-y-2">
                    {channels.map((channel) => (
                      <li key={channel.channelKey} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id={`channel-${channel.channelKey}`}
                          checked={selected.has(channel.channelKey)}
                          disabled={channel.alreadyGenerated}
                          onChange={() => toggleChannel(channel.channelKey)}
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <label htmlFor={`channel-${channel.channelKey}`} className="text-xs text-ink">
                          {channel.displayName}
                          {channel.durationLabel ? ` (${channel.durationLabel})` : ""}
                          {channel.alreadyGenerated && <span className="ml-1 text-muted">— already generated</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {message && (
                <div
                  role={isError ? "alert" : "status"}
                  className={`mt-3 rounded border px-3 py-2 text-xs font-medium ${isError ? "border-brick/30 bg-brick-tint text-brick" : "border-sage/30 bg-sage-tint text-sage"}`}
                >
                  {message}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <span className="text-[11px] text-muted">{selected.size} selected</span>
              <button
                type="button"
                onClick={generate}
                disabled={loading || selected.size === 0}
                className="flex items-center gap-1.5 rounded bg-pine px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading ? "Generating…" : "Generate Assets"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
