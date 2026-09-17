"use client";

import React, { useEffect, useState } from "react";
import { Check, Shield, AlertCircle, Loader2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
  slug: string;
}

interface TaskPermission {
  id: string;
  slug: string;
  name: string;
  module: string;
  description: string;
}

export default function RoleTaskMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<TaskPermission[]>([]);
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/roles/matrix")
      .then((res) => res.json())
      .then((data) => {
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
        setMatrix(data.matrix || {});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (roleId: string, permissionId: string) => {
    const isCurrentlyEnabled = matrix[roleId]?.includes(permissionId) ?? false;
    const nextState = !isCurrentlyEnabled;
    const key = `${roleId}-${permissionId}`;

    setUpdatingKey(key);
    setError(null);

    setMatrix((prev) => {
      const currentPerms = prev[roleId] || [];
      const updatedPerms = nextState
        ? [...currentPerms, permissionId]
        : currentPerms.filter((id) => id !== permissionId);
      return { ...prev, [roleId]: updatedPerms };
    });

    try {
      const res = await fetch("/api/settings/roles/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, permissionId, enabled: nextState }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update matrix in database.");
      }
    } catch (err: any) {
      setError(err.message);
      setMatrix((prev) => {
        const currentPerms = prev[roleId] || [];
        const reverted = isCurrentlyEnabled
          ? [...currentPerms, permissionId]
          : currentPerms.filter((id) => id !== permissionId);
        return { ...prev, [roleId]: reverted };
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading role-task matrix from RDS...
      </div>
    );
  }

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-6">
      <div className="border-b pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Role-Task Permission Matrix</h1>
          <p className="text-sm text-slate-600">
            Dynamically configure and audit which clinical roles are authorized to execute actions in the database.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full">
          <Shield className="w-3.5 h-3.5" /> Enforced in PostgreSQL
        </span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-700">
              <th className="py-3 px-4 font-semibold w-1/3">Clinical UI Action / Task</th>
              {roles.map((role) => (
                <th key={role.id} className="py-3 px-4 font-semibold text-center border-l">
                  {role.name}
                  <span className="block text-xs font-normal text-slate-400 font-mono mt-0.5">
                    {role.slug}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y text-slate-600">
            {modules.map((mod) => (
              <React.Fragment key={mod}>
                <tr className="bg-slate-100/60 font-bold text-xs uppercase tracking-wider text-slate-500">
                  <td colSpan={roles.length + 1} className="py-2 px-4">
                    {mod} Operations
                  </td>
                </tr>
                {permissions
                  .filter((p) => p.module === mod)
                  .map((perm) => (
                    <tr key={perm.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{perm.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{perm.slug}</div>
                      </td>
                      {roles.map((role) => {
                        const isChecked = matrix[role.id]?.includes(perm.id) ?? false;
                        const isBusy = updatingKey === `${role.id}-${perm.id}`;

                        return (
                          <td key={role.id} className="py-3 px-4 text-center border-l">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggle(role.id, perm.id)}
                              className={`w-6 h-6 inline-flex items-center justify-center rounded border transition-colors ${
                                isChecked
                                  ? "bg-teal-700 border-teal-700 text-white"
                                  : "border-slate-300 bg-white hover:border-slate-400"
                              } ${isBusy ? "opacity-50" : ""}`}
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                              ) : isChecked ? (
                                <Check className="w-4 h-4 stroke-[3]" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
