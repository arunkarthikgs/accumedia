"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  Building2,
  UserCheck,
  CheckCircle2,
  UploadCloud,
  FileText,
  Terminal,
  ArrowRight,
  Cpu,
  Clock,
  ExternalLink,
  Layers,
} from "lucide-react";
import PromptInspectorModal from "@/components/PromptInspectorModal";

interface Organization {
  id: string;
  name: string;
  slug?: string;
}

interface Physician {
  id: string;
  name: string;
  specialty: string | null;
  registrationNo: string | null;
  organizationId: string | null;
  organization?: {
    id: string;
    name: string;
  } | null;
}

const ASR_MODELS = [
  {
    id: "whisper-1",
    name: "OpenAI Whisper-1",
    category: "General Cloud ASR",
    description: "Multilingual, robust phonetic handling",
  },
  {
    id: "deepgram-nova-3-medical",
    name: "Deepgram Nova-3 Medical",
    category: "Medical-Tuned Cloud",
    description: "Tuned for clinical pharmacology & low latency",
  },
  {
    id: "faster-whisper-self-hosted",
    name: "Faster-Whisper (Self-Hosted)",
    category: "On-Prem / Private VPC",
    description: "Zero data leakage, DPDP sovereign execution",
  },
];

export default function NewCasePage() {
  const router = useRouter();

  // Organizations & Physicians
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedPhysicianId, setSelectedPhysicianId] = useState<string>("");

  // Pluggable ASR Model Selection
  const [selectedAsrModel, setSelectedAsrModel] = useState<string>("whisper-1");

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [fixedDuration, setFixedDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Lifecycle & Persistence Identifiers
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingR2Key, setRecordingR2Key] = useState<string | null>(null);
  const [currentDbStatus, setCurrentDbStatus] = useState<string>("IDLE");
  const [activeTranscriberAgent, setActiveTranscriberAgent] = useState<string | null>(null);
  const [asrExecutionDurationMs, setAsrExecutionDurationMs] = useState<number | null>(null);

  // Editable Stage Content
  const [rawTranscript, setRawTranscript] = useState("");
  const [refinedText, setRefinedText] = useState("");

  // Async Processing Indicators
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isStep1Processing, setIsStep1Processing] = useState(false);
  const [isStep2Processing, setIsStep2Processing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inspector Modal
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Audio Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [orgRes, userRes] = await Promise.all([
          fetch("/api/organizations"),
          fetch("/api/users"),
        ]);

        let loadedOrgs: Organization[] = [];
        if (orgRes.ok) {
          const orgData = await orgRes.json();
          loadedOrgs = orgData.organizations || [];
          setOrganizations(loadedOrgs);
        }

        let loadedUsers: Physician[] = [];
        if (userRes.ok) {
          const userData = await userRes.json();
          loadedUsers = userData.users || [];
          setPhysicians(loadedUsers);
        }

        if (loadedOrgs.length === 0 && loadedUsers.length > 0) {
          const orgMap = new Map<string, Organization>();
          loadedUsers.forEach((u) => {
            if (u.organization) {
              orgMap.set(u.organization.id, {
                id: u.organization.id,
                name: u.organization.name,
              });
            }
          });
          loadedOrgs = Array.from(orgMap.values());
          setOrganizations(loadedOrgs);
        }

        if (loadedOrgs.length > 0) setSelectedOrgId(loadedOrgs[0].id);
        if (loadedUsers.length > 0) setSelectedPhysicianId(loadedUsers[0].id);
      } catch (err) {
        console.error("Failed to load metadata:", err);
      }
    }
    loadMetadata();
  }, []);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(null);
    }
  }, [audioBlob]);

  const startRecording = async () => {
    setErrorMessage(null);
    setActiveCaseId(null);
    setRecordingId(null);
    setRecordingR2Key(null);
    setCurrentDbStatus("IDLE");
    setActiveTranscriberAgent(null);
    setAsrExecutionDurationMs(null);
    setRawTranscript("");
    setRefinedText("");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      setFixedDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage("Microphone access denied or audio input device not found.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setFixedDuration(recordingDuration);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const discardRecording = () => {
    if (audioElementRef.current) audioElementRef.current.pause();
    setIsPlaying(false);
    setAudioBlob(null);
    setAudioUrl(null);
    setActiveCaseId(null);
    setRecordingId(null);
    setRecordingR2Key(null);
    setCurrentDbStatus("IDLE");
    setActiveTranscriberAgent(null);
    setAsrExecutionDurationMs(null);
    setRawTranscript("");
    setRefinedText("");
    setRecordingDuration(0);
    setFixedDuration(0);
    setPlaybackTime(0);
  };

  // STEP 0: Upload Audio Immediately & Instantly Create Case in DB
  const handleUploadAndCreateCase = async () => {
    if (!audioBlob) return;
    if (!selectedOrgId) {
      setErrorMessage("Please select a healthcare organization first.");
      return;
    }

    setErrorMessage(null);
    setIsUploadingAudio(true);

    try {
      const finalDuration = fixedDuration > 0 ? fixedDuration : recordingDuration;
      const uploadFormData = new FormData();
      uploadFormData.append("audio", audioBlob, `clinical-dictation-${Date.now()}.webm`);
      uploadFormData.append("orgId", selectedOrgId);
      if (selectedPhysicianId) uploadFormData.append("userId", selectedPhysicianId);
      uploadFormData.append("durationSeconds", finalDuration.toString());

      const uploadRes = await fetch("/api/audio/upload", {
        method: "POST",
        body: uploadFormData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Failed to upload audio.");

      setActiveCaseId(uploadData.caseId);
      setRecordingId(uploadData.recordingId);
      setRecordingR2Key(uploadData.r2Key);
      setCurrentDbStatus("UPLOADED");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to upload audio and create case.");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  // STEP 1: Execute Stage 1 Speech-to-Text with Pluggable Model
  const handleRunStep1ASR = async () => {
    if (!audioBlob || !recordingId) {
      setErrorMessage("Audio must be archived first.");
      return;
    }

    setErrorMessage(null);
    setIsStep1Processing(true);

    try {
      const transcribeFormData = new FormData();
      transcribeFormData.append("audio", audioBlob, "dictation.webm");
      transcribeFormData.append("recordingId", recordingId);
      transcribeFormData.append("model", selectedAsrModel);

      const transcribeRes = await fetch("/api/audio/transcribe", {
        method: "POST",
        body: transcribeFormData,
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) {
        throw new Error(transcribeData.error || "Stage 1 ASR transcription failed.");
      }

      setRawTranscript(transcribeData.rawTranscript || "");
      setCurrentDbStatus(transcribeData.transcriptionStatus || "ASR_COMPLETED");
      setActiveTranscriberAgent(transcribeData.agentUsed || selectedAsrModel);
      setAsrExecutionDurationMs(transcribeData.durationMs || null);
    } catch (err: any) {
      setErrorMessage(err.message || "Stage 1 failed.");
    } finally {
      setIsStep1Processing(false);
    }
  };

  // STEP 2: Clinician Dispatches Reviewed Transcript to GPT-4o
  const handleRunStep2Refinement = async () => {
    if (!recordingId) {
      setErrorMessage("Please complete Stage 1 transcription first.");
      return;
    }
    if (!rawTranscript.trim()) {
      setErrorMessage("Raw transcript cannot be empty.");
      return;
    }

    setErrorMessage(null);
    setIsStep2Processing(true);
    setCurrentDbStatus("REFINING");

    try {
      const res = await fetch("/api/audio/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingId,
          textToRefine: rawTranscript.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stage 2 LLM refinement failed.");

      setRefinedText(data.transcribedText || "");
      setCurrentDbStatus(data.transcriptionStatus || "REFINED");
    } catch (err: any) {
      setErrorMessage(err.message || "Stage 2 refinement failed.");
      setCurrentDbStatus("ASR_COMPLETED");
    } finally {
      setIsStep2Processing(false);
    }
  };

  // STEP 3: Final Case Synthesis
  const handleSynthesize = async () => {
    setErrorMessage(null);
    const finalNarrative = refinedText.trim() || rawTranscript.trim();

    if (!finalNarrative) {
      setErrorMessage("Please provide clinical narrative text before synthesizing.");
      return;
    }
    if (!selectedOrgId) {
      setErrorMessage("Please select a healthcare organization.");
      return;
    }

    setIsSynthesizing(true);
    try {
      const response = await fetch("/api/cases/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: finalNarrative,
          physicianId: selectedPhysicianId || undefined,
          organizationId: selectedOrgId,
          audioRecordingId: recordingId || undefined,
          caseId: activeCaseId || undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Synthesis failed.");

      router.push(result.case?.id ? `/cases/${result.case.id}/review` : "/");
    } catch (err: any) {
      setErrorMessage(err.message || "Synthesis error.");
      setIsSynthesizing(false);
    }
  };

  const togglePlayback = () => {
    if (!audioElementRef.current || !audioUrl) return;
    if (isPlaying) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElementRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const restartPlayback = () => {
    if (!audioElementRef.current) return;
    audioElementRef.current.currentTime = 0;
    audioElementRef.current.play();
    setIsPlaying(true);
  };

  const formatSeconds = (sec: number) => {
    if (!Number.isFinite(sec) || isNaN(sec) || sec < 0) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const totalDuration =
    fixedDuration > 0
      ? fixedDuration
      : Number.isFinite(audioElementRef.current?.duration)
      ? audioElementRef.current?.duration || 0
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Top Navigation & Inspector Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
              <Link href="/" className="flex items-center gap-1 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span>/</span>
              <span>New Case Ingestion</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Pluggable Clinical Ingestion & Transcription
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Persistent Case Initiation → Dynamic ASR Engine Selection → LLM Clinical Refinement
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsInspectorOpen(true)}
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-teal-500 hover:text-teal-700 transition"
          >
            <Terminal className="h-3.5 w-3.5 text-teal-600" />
            <span>Audit Trail & DB Inspector</span>
          </button>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Configuration Bar: Organization, Physician & Pluggable ASR Engine */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="h-3.5 w-3.5 text-teal-600" /> Healthcare Organization
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={!!activeCaseId}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden disabled:opacity-60"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <UserCheck className="h-3.5 w-3.5 text-teal-600" /> Attending Physician / RMP
            </label>
            <select
              value={selectedPhysicianId}
              onChange={(e) => setSelectedPhysicianId(e.target.value)}
              disabled={!!activeCaseId}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden disabled:opacity-60"
            >
              {physicians.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.specialty ? `(${p.specialty})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-teal-600" /> Speech Engine (ASR)
              </span>
              <span className="text-[10px] font-normal text-slate-400">Pluggable</span>
            </label>
            <select
              value={selectedAsrModel}
              onChange={(e) => setSelectedAsrModel(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-hidden"
            >
              {ASR_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.category})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-400 truncate">
              {ASR_MODELS.find((m) => m.id === selectedAsrModel)?.description}
            </p>
          </div>
        </div>

        {/* Audio Recording & Asynchronous Case Creation Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Audio Dictation Capture</h2>
              <p className="text-[11px] text-slate-400">
                Dictate clinical encounters. Audio is archived and linked to a persistent Case ID immediately upon submission.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 animate-pulse"
                >
                  <Square className="h-3.5 w-3.5 fill-current" /> Stop Dictating ({formatSeconds(recordingDuration)})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  <Mic className="h-3.5 w-3.5 text-teal-600" /> Start Dictation
                </button>
              )}
            </div>
          </div>

          {/* Persistent Case ID & Status Banner */}
          {activeCaseId && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-teal-50/70 p-3.5 text-xs border border-teal-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                <div>
                  <span className="font-bold text-teal-900">Case Created in DB: </span>
                  <span className="font-mono text-teal-800">{activeCaseId}</span>
                  <div className="text-[11px] text-teal-700 mt-0.5 flex items-center gap-2">
                    <span>
                      Audio status: <strong className="uppercase font-mono">{currentDbStatus}</strong>
                    </span>
                    {activeTranscriberAgent && (
                      <span className="rounded-md bg-teal-200/60 px-1.5 py-0.2 font-mono text-[10px] text-teal-950">
                        Engine: {activeTranscriberAgent}
                        {asrExecutionDurationMs ? ` (${asrExecutionDurationMs}ms)` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/admin/cases"
                  className="flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-2xs hover:bg-teal-50 transition"
                >
                  <Clock className="h-3.5 w-3.5 text-teal-600" />
                  <span>Resume Later from Admin Cases</span>
                  <ExternalLink className="h-3 w-3 ml-0.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Audio Player & Multi-Stage Action Controls */}
          {audioUrl && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3.5">
              <audio
                ref={audioElementRef}
                src={audioUrl}
                onTimeUpdate={() => setPlaybackTime(audioElementRef.current?.currentTime || 0)}
                onLoadedMetadata={() => {
                  if (audioElementRef.current) {
                    const dur = audioElementRef.current.duration;
                    if (Number.isFinite(dur) && dur > 0) setFixedDuration(dur);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setPlaybackTime(0);
                }}
              />

              <button
                type="button"
                onClick={togglePlayback}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs hover:bg-teal-700 transition"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={restartPlayback}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-200 bg-white text-teal-800 hover:bg-teal-50 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <div className="flex flex-1 items-center gap-2 min-w-[180px]">
                <Volume2 className="h-3.5 w-3.5 text-teal-700" />
                <input
                  type="range"
                  min={0}
                  max={totalDuration > 0 ? totalDuration : 100}
                  value={playbackTime}
                  onChange={(e) => {
                    const time = Number(e.target.value);
                    if (audioElementRef.current) audioElementRef.current.currentTime = time;
                    setPlaybackTime(time);
                  }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-teal-200 accent-teal-600"
                />
                <span className="text-[11px] font-mono text-teal-900 w-24 text-right">
                  {formatSeconds(playbackTime)} / {formatSeconds(totalDuration)}
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {!activeCaseId ? (
                  <button
                    type="button"
                    onClick={handleUploadAndCreateCase}
                    disabled={isUploadingAudio}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 disabled:opacity-60 transition"
                  >
                    {isUploadingAudio ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Creating Case & Archiving...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Submit Audio & Create Case</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunStep1ASR}
                    disabled={isStep1Processing || isStep2Processing}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 disabled:opacity-60 transition"
                  >
                    {isStep1Processing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Transcribing via {selectedAsrModel}...</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="h-3.5 w-3.5" />
                        <span>
                          {rawTranscript ? "Re-transcribe with Selected Engine" : `Transcribe (${selectedAsrModel})`}
                        </span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={discardRecording}
                  disabled={isUploadingAudio || isStep1Processing || isStep2Processing}
                  className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Discard</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* STAGE 1: Literal Transcription & Review */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Stage 1 Output
                </span>
                {activeTranscriberAgent && (
                  <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-mono font-semibold text-teal-800 border border-teal-200">
                    Engine: {activeTranscriberAgent}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-teal-600" /> Literal Speech-to-Text
              </h3>
              <p className="text-[11px] text-slate-500">
                Verbatim output. Review and adjust phonetic misinterpretations before executing Stage 2 refinement.
              </p>
            </div>

            {rawTranscript && (
              <button
                type="button"
                onClick={handleRunStep2Refinement}
                disabled={isStep2Processing || !rawTranscript.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition"
              >
                {isStep2Processing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Refining Clinical Syntax...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Proceed to Stage 2 (LLM Refinement)</span>
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>

          <textarea
            rows={7}
            value={rawTranscript}
            onChange={(e) => setRawTranscript(e.target.value)}
            placeholder="Stage 1 verbatim transcription will appear here after running speech-to-text, or you can paste clinical notes directly..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs leading-relaxed text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* STAGE 2: LLM Clinical Refinement */}
        {(refinedText || currentDbStatus === "REFINING" || currentDbStatus === "REFINED") && (
          <div className="rounded-2xl border border-teal-200 bg-white p-6 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-50 pb-2">
              <div>
                <span className="inline-block rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase tracking-wider mb-1">
                  Stage 2 Result
                </span>
                <h3 className="text-sm font-semibold text-teal-950 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-teal-600" /> Massaged & Refined Clinical Narrative (GPT-4o)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Standardized pharmacology, clinical abbreviations, and paragraph layout ready for final synthesis.
                </p>
              </div>

              {currentDbStatus === "REFINED" && (
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Refined & Persisted in PostgreSQL</span>
                </div>
              )}
            </div>

            <textarea
              rows={9}
              value={refinedText}
              onChange={(e) => setRefinedText(e.target.value)}
              placeholder="Refined clinical text will appear here after executing Stage 2..."
              className="w-full rounded-xl border border-teal-200 bg-teal-50/20 p-4 font-mono text-xs leading-relaxed text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden"
            />
          </div>
        )}

        {/* Final Submission Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </Link>

          <button
            type="button"
            onClick={handleSynthesize}
            disabled={isSynthesizing || (!rawTranscript.trim() && !refinedText.trim()) || isStep1Processing || isStep2Processing}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSynthesizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Synthesizing Master Clinical Record...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Synthesize & Verify Compliance
              </>
            )}
          </button>
        </div>
      </div>

      {/* Slide-over DB & Prompts Inspector Modal */}
      <PromptInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        orgId={selectedOrgId}
        recordingId={recordingId || undefined}
      />
    </div>
  );
}
