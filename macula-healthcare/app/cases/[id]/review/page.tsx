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
