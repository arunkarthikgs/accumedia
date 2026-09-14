"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UserPlus, Shield, Stethoscope, Mail, Hash, X, ArrowLeft, AlertCircle } from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

interface Physician {
  id: string;
  name: string;
  email: string;
  registrationNo?: string | null;
  specialty?: string | null;
  role?: { name: string; slug: string };
  organization?: Organization;
}

export default function UsersSettingsPage() {
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [availableSpecialties, setAvailableSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    registrationNo: "",
    specialty: "",
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/users");
      const contentType = res.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (res.ok) {
          setPhysicians(data.users || []);
          setAvailableSpecialties(data.specialties || []);
        } else {
          setError(data.error || "Failed to load physicians");
        }
      } else {
        const text = await res.text();
        setError(`Server returned status ${res.status}.`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to connect to /api/users endpoint.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save practitioner");
      }

      setFormData({
        name: "",
        email: "",
        registrationNo: "",
        specialty: "",
      });
      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
              <Link href="/" className="flex items-center gap-1 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span>/</span>
              <span>Settings</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Attending Physicians &amp; Medical Staff
            </h1>
            <p className="text-xs text-slate-500">
              Registered Medical Practitioners (RMPs) across all clinical disciplines authorized for DPDP &amp; NMC sign-offs.
            </p>
          </div>
          <button
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-700/20 transition hover:bg-teal-700"
          >
            <UserPlus className="h-4 w-4" />
            Add Physician
          </button>
        </div>

        {error && !modalOpen && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="text-sm">
              <p className="font-semibold">Notice</p>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
            Loading practitioners...
          </div>
        ) : physicians.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Stethoscope className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No practitioners registered yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Click &quot;Add Physician&quot; to authorize any medical specialist.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {physicians.map((doc) => {
              const initials = (doc.name || "DR")
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-sm font-bold text-teal-800">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-slate-900">{doc.name}</h4>
                      <p className="text-xs font-medium text-teal-700 truncate">
                        {doc.specialty || "General Medicine / Surgery"}
                      </p>

                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          <span className="truncate">{doc.email}</span>
                        </div>
                        {doc.registrationNo && (
                          <div className="flex items-center gap-2">
                            <Hash className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                            <span>
                              Reg: <strong className="text-slate-700">{doc.registrationNo}</strong>
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                          <span className="text-[11px] font-semibold text-emerald-700">
                            {doc.role?.name || "Consultant RMP"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-teal-600" />
                  <h3 className="text-base font-bold text-slate-900">Add Attending Physician</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Physician Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. A. Sharma"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Hospital Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="physician@hospital.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Medical Council Reg No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. State Council / National Registration Number"
                    value={formData.registrationNo}
                    onChange={(e) => setFormData({ ...formData, registrationNo: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Department / Clinical Specialty
                  </label>
                  <input
                    type="text"
                    list="specialties-list"
                    placeholder="Type or select any clinical department"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                  <datalist id="specialties-list">
                    {availableSpecialties.map((spec) => (
                      <option key={spec} value={spec} />
                    ))}
                  </datalist>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Physician"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
