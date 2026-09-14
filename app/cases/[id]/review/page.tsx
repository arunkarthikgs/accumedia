import Link from "next/link";

export default function SafetyGatePage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Clinical Compliance & Safety Gate</h1>
        <p className="text-xs text-slate-500 mt-1">Review active de-identification benchmarks and ethical advertising audits.</p>
      </div>

      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <h3 className="text-sm font-bold text-slate-900">DPDP & Safe Harbor Redaction Standard</h3>
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">18 PHI Rules Enforced</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border space-y-2">
            <span className="font-bold text-slate-900 block">Identifiable Patient Data Screened</span>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>Patient Full Names & Aliases</li>
              <li>Hospital Registration (UHID / MRN)</li>
              <li>Exact Admission & Discharge Dates</li>
              <li>Geographic or PIN identifiers</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border space-y-2">
            <span className="font-bold text-slate-900 block">NMC Medical Ethics Enforcement</span>
            <ul className="space-y-1 text-slate-600 list-disc list-inside">
              <li>No curative guarantees (&quot;100% cure&quot;)</li>
              <li>No superiority advertising (&quot;best hospital&quot;)</li>
              <li>Compulsory CME educational framing</li>
              <li>Mandatory RMP consultation disclaimer</li>
            </ul>
          </div>
        </div>

        <div className="pt-4 border-t flex justify-end">
          <Link href="/cases/new" className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">
            Start Live Case Audit &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
