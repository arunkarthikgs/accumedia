"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, Check, Lock, Loader2, AlertCircle } from "lucide-react";

interface Permission {
  id: string;
  slug: string;
  name: string;
  module: string;
  description: string;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
}

interface Role {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  permissions: RolePermission[];
}

export default function RoleMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error("Failed to load roles and permissions");
      const data = await res.json();
      setRoles(data.roles || []);
      setPermissions(data.permissions || []);
    } catch (err: any) {
      setError(err.message || "Failed to load matrix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (roleId: string, permissionId: string, currentStatus: boolean) => {
    const key = `${roleId}-${permissionId}`;
    setUpdatingKey(key);

    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          permissionId,
          enabled: !currentStatus,
        }),
      });

      if (!res.ok) throw new Error("Failed to update permission");

      setRoles((prev) =>
        prev.map((r) => {
          if (r.id !== roleId) return r;
          const exists = r.permissions.some((p) => p.permissionId === permissionId);
          const updatedPerms = exists
            ? r.permissions.filter((p) => p.permissionId !== permissionId)
            : [...r.permissions, { roleId, permissionId }];
          return { ...r, permissions: updatedPerms };
        })
      );
    } catch (err: any) {
      alert(err.message || "Permission update failed");
    } finally {
      setUpdatingKey(null);
    }
  };

  // Group permissions by clinical module
  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
              <Link href="/" className="flex items-center gap-1 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Dashboard
              </Link>
              <span>/</span>
              <span>Settings</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Role &amp; Task Permission Matrix
            </h1>
            <p className="text-xs text-slate-500">
              Granular regulatory access control for DPDP redaction, physician sign-offs, and CME exports.
            </p>
          </div>
          <Link
            href="/settings/users"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Manage Physicians
          </Link>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70">
                    <th className="py-4 pl-6 pr-4 text-xs font-bold uppercase tracking-wider text-slate-600">
                      Module / Clinical Task
                    </th>
                    {roles.map((role) => (
                      <th
                        key={role.id}
                        className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-700"
                      >
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span>{role.name}</span>
                          <span className="text-[10px] font-medium text-slate-400">({role.slug})</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modules.map((mod) => (
                    <tr key={mod} className="contents">
                      {/* Module Section Header */}
                      <tr className="bg-slate-100/60">
                        <td
                          colSpan={roles.length + 1}
                          className="py-2 pl-6 text-xs font-bold tracking-wider text-teal-900 uppercase"
                        >
                          {mod}
                        </td>
                      </tr>
                      {permissions
                        .filter((p) => p.module === mod)
                        .map((perm) => (
                          <tr key={perm.id} className="transition hover:bg-slate-50/50">
                            <td className="py-3.5 pl-6 pr-4">
                              <div className="font-semibold text-slate-900">{perm.name}</div>
                              <div className="text-xs text-slate-400">{perm.description}</div>
                            </td>
                            {roles.map((role) => {
                              const isChecked = role.permissions.some(
                                (p) => p.permissionId === perm.id
                              );
                              const isBusy = updatingKey === `${role.id}-${perm.id}`;

                              return (
                                <td key={role.id} className="px-4 py-3.5 text-center">
                                  <button
                                    onClick={() => handleToggle(role.id, perm.id, isChecked)}
                                    disabled={isBusy}
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition ${
                                      isChecked
                                        ? "bg-teal-600 text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700"
                                        : "border border-slate-200 bg-white text-transparent hover:border-slate-300"
                                    } ${isBusy ? "opacity-40" : ""}`}
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                                    ) : (
                                      <Check className={`h-4 w-4 stroke-[3] ${isChecked ? "text-white" : "text-transparent"}`} />
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
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
  );
}
