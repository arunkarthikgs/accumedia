"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UserPlus, Shield, Stethoscope, Mail, Hash, X, ArrowLeft, AlertCircle, Pencil, KeyRound, Loader2 } from "lucide-react";
import { fetchJsonOnce } from "@/lib/client-fetch";

interface Organization {
  id: string;
  name: string;
}

interface Physician {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  registrationNo?: string | null;
  specialty?: string | null;
  qualifications?: string | null;
  designation?: string | null;
  profilePhotoUrl?: string | null;
  profilePhotoR2Key?: string | null;
  role?: { name: string; slug: string };
  organization?: Organization;
}

export default function UsersSettingsPage() {
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [availableSpecialties, setAvailableSpecialties] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [scopeReady, setScopeReady] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ name: string; src: string } | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetMessages, setResetMessages] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    registrationNo: "",
    specialty: "",
    qualifications: "",
    designation: "",
    profilePhotoUrl: "",
    organizationId: selectedOrganizationId,
    password: "",
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const organizationQuery = selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : "";
      try {
        const data = await fetchJsonOnce<any>(`/api/users${organizationQuery}`);
        const scopedUsers = selectedOrganizationId
          ? (data.users || []).filter((item: Physician) => item.organization?.id === selectedOrganizationId)
          : data.users || [];
        setPhysicians(scopedUsers);
        setOrganizations(data.organizations || []);
        setIsSuperAdmin(Boolean(data.isSuperAdmin));
        setCanManageUsers(Boolean(data.canManageUsers));
        setAvailableSpecialties(data.specialties || []);
      } catch (requestError: any) {
        setError(requestError.message || "Failed to load physicians");
      }
    } catch (e: any) {
      setError(e.message || "Failed to connect to /api/users endpoint.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const organizationId = new URLSearchParams(window.location.search).get("organizationId") || "";
    setSelectedOrganizationId(organizationId);
    if (organizationId) setFormData((current) => ({ ...current, organizationId }));
    setScopeReady(true);
  }, []);

  useEffect(() => {
    if (!scopeReady) return;
    fetchUsers();
  }, [scopeReady, selectedOrganizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/users", {
        method: editingUserId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUserId ? { ...formData, userId: editingUserId } : formData),
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
        qualifications: "",
        designation: "",
        profilePhotoUrl: "",
        organizationId: selectedOrganizationId,
        password: "",
      });
      setModalOpen(false);
      setEditingUserId(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    setEditingUserId(null);
    setFormData({ name: "", email: "", registrationNo: "", specialty: "", qualifications: "", designation: "", profilePhotoUrl: "", organizationId: selectedOrganizationId, password: "" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (physician: Physician) => {
    setEditingUserId(physician.id);
    setFormData({ name: physician.name, email: physician.email, registrationNo: physician.registrationNo || "", specialty: physician.specialty || "", qualifications: physician.qualifications || "", designation: physician.designation || "", profilePhotoUrl: physician.profilePhotoUrl || "", organizationId: physician.organization?.id || selectedOrganizationId, password: "" });
    setError(null);
    setModalOpen(true);
  };

  const sendPasswordReset = async (physician: Physician) => {
    setResettingUserId(physician.id);
    setResetMessages((current) => ({ ...current, [physician.id]: "" }));
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: physician.id, resetPassword: true }) });
      const data = await response.json();
      setResetMessages((current) => ({ ...current, [physician.id]: response.ok ? "Reset link sent" : data.error || "Reset failed" }));
    } catch (error: any) {
      setResetMessages((current) => ({ ...current, [physician.id]: error.message || "Reset failed" }));
    } finally {
      setResettingUserId(null);
    }
  };

  return (
    <div className="readable-route min-h-screen bg-paper p-8 text-ink">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
              <Link href="/admin/organizations" className="flex items-center gap-1 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Hospital Networks
              </Link>
              <span>/</span>
              <span>Settings</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Attending Physicians &amp; Medical Staff
            </h1>
            <p className="text-xs text-muted">
              Registered Medical Practitioners (RMPs) across all clinical disciplines authorized for DPDP &amp; NMC sign-offs.
            </p>
          </div>
          <Link
            href={`/settings/users/new${selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : ""}`}
            aria-disabled={!canManageUsers}
            tabIndex={canManageUsers ? 0 : -1}
            className={`flex items-center justify-center gap-2 rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-pine-dark ${!canManageUsers ? "pointer-events-none opacity-50" : ""}`}
          >
            <UserPlus className="h-4 w-4" />
            Add Physician
          </Link>
        </div>

        {error && !modalOpen && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-brick/30 bg-brick-tint p-4 text-brick">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brick" />
            <div className="text-sm">
              <p className="font-semibold">Notice</p>
              <p className="text-brick">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-line bg-surface p-12 text-center text-sm text-muted">
            Loading practitioners...
          </div>
        ) : physicians.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface p-12 text-center">
            <Stethoscope className="mx-auto mb-3 h-10 w-10 text-line" />
            <p className="text-sm font-semibold text-ink">No practitioners registered yet</p>
            <p className="mt-1 text-xs text-muted">
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
              const photoSrc = doc.profilePhotoR2Key
                ? `/api/profile-media/serve?userId=${encodeURIComponent(doc.id)}`
                : doc.profilePhotoUrl || "";

              return (
                <div
                  key={doc.id}
                  className="rounded-lg border border-line bg-surface p-5 transition hover:border-pine/50"
                >
                  <div className="flex items-start gap-4">
                    {photoSrc ? (
                      <button type="button" onClick={() => setPreviewPhoto({ name: doc.name, src: photoSrc })} className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-pine/20 bg-pine-tint text-sm font-bold text-pine" title={`View ${doc.name}'s original photo`}>
                        <img src={photoSrc} alt={`${doc.name} profile`} className="h-full w-full object-cover" />
                      </button>
                    ) : <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-pine/20 bg-pine-tint text-sm font-bold text-pine">{initials}</div>}
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-bold text-ink">{doc.name}</h4>
                      <p className="text-xs font-medium text-pine truncate">
                        {doc.specialty || "General Medicine / Surgery"}
                      </p>

                      <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                          <span className="truncate">{doc.email}</span>
                        </div>
                        {doc.registrationNo && (
                          <div className="flex items-center gap-2">
                            <Hash className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                            <span>
                              Reg: <strong className="text-ink">{doc.registrationNo}</strong>
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5 flex-shrink-0 text-sage" />
                          <span className={`text-[11px] font-semibold ${doc.isActive ? "text-sage" : "text-brick"}`}>
                            {doc.isActive ? (doc.role?.name || "Consultant RMP") : "Account suspended"}
                          </span>
                        </div>
                        {doc.designation && <div className="text-[11px] text-ink">{doc.designation}</div>}
                        {doc.qualifications && <div className="text-[11px] text-muted">{doc.qualifications}</div>}
                      </div>
                    </div>
                  </div>
                  {canManageUsers && <div className="mt-4 flex flex-wrap items-center gap-3"><Link href={`/settings/users/${doc.id}/edit?organizationId=${encodeURIComponent(selectedOrganizationId || doc.organization?.id || "")}`} className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><Pencil className="h-3.5 w-3.5" /> Edit user</Link><Link href={`/settings/users/${doc.id}/edit?organizationId=${encodeURIComponent(selectedOrganizationId || doc.organization?.id || "")}&photo=1`} className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><Pencil className="h-3.5 w-3.5" /> Profile photo</Link><button type="button" onClick={() => void sendPasswordReset(doc)} disabled={resettingUserId === doc.id} title="Send password reset link" aria-label={`Send password reset link to ${doc.name}`} className="inline-flex h-7 w-7 items-center justify-center rounded border border-pine/30 bg-pine-tint text-pine hover:bg-pine/10 disabled:opacity-50">{resettingUserId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}</button>{resetMessages[doc.id] && <span className="text-[10px] text-muted">{resetMessages[doc.id]}</span>}</div>}
                </div>
              );
            })}
          </div>
        )}

        {previewPhoto && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4" role="dialog" aria-modal="true" aria-label={`${previewPhoto.name} original profile photo`} onClick={() => setPreviewPhoto(null)}>
            <button type="button" onClick={() => setPreviewPhoto(null)} className="absolute right-4 top-4 rounded bg-surface/90 p-2 text-ink hover:bg-white" aria-label="Close photo preview"><X className="h-5 w-5" /></button>
            <img src={previewPhoto.src} alt={`${previewPhoto.name} original profile`} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(event) => event.stopPropagation()} />
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-pine" />
                  <h3 className="text-base font-bold text-ink">{editingUserId ? "Edit User Profile" : "Add Attending Physician"}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg p-1 text-muted hover:bg-paper hover:text-ink"
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
                {isSuperAdmin && <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Organisation</label>
                  <select required value={formData.organizationId} onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none">
                    <option value="">Select hospital or clinic</option>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </div>}
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
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Initial password</label>
                  <input type="password" required={!editingUserId} minLength={8} autoComplete="new-password" placeholder={editingUserId ? "Leave blank to keep current password" : "At least 8 characters"} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                  <p className="mt-1 text-[11px] text-muted">Passwords are stored securely as hashes.</p>
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

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Qualifications</label>
                  <input type="text" placeholder="MBBS, MD, FRCS" value={formData.qualifications} onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Designation</label>
                  <input type="text" placeholder="Consultant Cardiologist" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Profile photo URL</label>
                  <input type="url" placeholder="https://.../doctor.jpg" value={formData.profilePhotoUrl} onChange={(e) => setFormData({ ...formData, profilePhotoUrl: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none" />
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
                    {submitting ? "Saving..." : editingUserId ? "Save Changes" : "Save Physician"}
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
