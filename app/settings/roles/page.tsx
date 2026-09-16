"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, ChevronDown, CircleHelp, Eye, LockKeyhole, Plus, ShieldCheck, SlidersHorizontal, Loader2, AlertCircle, X } from "lucide-react";

type Permission = { id: string; slug: string; name: string; module: string | null; description: string | null };
type Task = { id: string; slug: string; name: string; module: string | null; description: string | null; permissions: { id: string }[] };
type Role = { id: string; name: string; slug: string; isSystem: boolean; organizationId: string | null; definition?: { name: string; slug: string } | null; rolePermissions: { permissionId: string }[] };
type Organization = { id: string; name: string; slug: string };

export default function RoleMatrixPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [createRoleName, setCreateRoleName] = useState("");
  const [createRoleDescription, setCreateRoleDescription] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  const fetchData = async (selectedOrganizationId = organizationId) => {
    try {
      setLoading(true);
      setError(null);
      const query = selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : "";
      const response = await fetch(`/api/roles${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load role matrix");
      setRoles(data.roles || []);
      setPermissions(data.permissions || []);
      setTasks(data.taskDefinitions || []);
      setOrganizations(data.organizations || []);
      setCurrentOrganization(data.currentOrganization || null);
      setIsSuperAdmin((data.organizations || []).length > 0);
      if (data.organizationId !== undefined && data.organizationId !== organizationId) setOrganizationId(data.organizationId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matrix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingRole(true);
    setError(null);
    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createRole", name: createRoleName, description: createRoleDescription, organizationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Role creation failed");
      setRoles((current) => [...current, data.role]);
      setCreateRoleName("");
      setCreateRoleDescription("");
      setCreateRoleOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role creation failed");
    } finally {
      setCreatingRole(false);
    }
  };

  const togglePermission = async (role: Role, permissionId: string) => {
    if ((!role.organizationId && !isSuperAdmin) || (role.isSystem && !isSuperAdmin)) return;
    const enabled = !role.rolePermissions.some((item) => item.permissionId === permissionId);
    const key = `${role.id}-${permissionId}`;
    setUpdatingKey(key);
    setRoles((current) => current.map((item) => item.id !== role.id ? item : {
      ...item,
      rolePermissions: enabled
        ? [...item.rolePermissions, { permissionId }]
        : item.rolePermissions.filter((entry) => entry.permissionId !== permissionId),
    }));
    try {
      const response = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id, permissionId, enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Permission update failed");
    } catch (err) {
      setRoles((current) => current.map((item) => item.id !== role.id ? item : {
        ...item,
        rolePermissions: enabled
          ? item.rolePermissions.filter((entry) => entry.permissionId !== permissionId)
          : [...item.rolePermissions, { permissionId }],
      }));
      setError(err instanceof Error ? err.message : "Permission update failed");
    } finally {
      setUpdatingKey(null);
    }
  };

  const taskRows = useMemo(() => tasks.length ? tasks : permissions.map((permission) => ({ ...permission, permissions: [{ id: permission.id }] })), [tasks, permissions]);
  const modules = useMemo(() => Array.from(new Set(taskRows.map((task) => task.module || "General"))), [taskRows]);
  const editableRole = (role: Role) => Boolean((role.organizationId || isSuperAdmin) && (!role.isSystem || isSuperAdmin));
  const enabledCount = (role: Role) => new Set(role.rolePermissions.map((item) => item.permissionId)).size;
  const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));

  return (
    <main className="role-matrix min-h-screen bg-[#f5f7f6] text-slate-900">
      <style>{".role-matrix table button { width: 20px !important; height: 20px !important; } .role-matrix table button svg { width: 14px !important; height: 14px !important; } .role-matrix table button[class*='border-slate-200'][class*='text-transparent'] { border-color: #94a3b8 !important; background-color: #f8fafc !important; }"}</style>
      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700"><Link href="/" className="flex items-center gap-1 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Dashboard</Link><span className="text-slate-300">/</span><span>Settings</span></div>
            <div className="flex items-start gap-3"><div className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div><div><h1 className="text-2xl font-semibold tracking-tight">Role Task Matrix</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Control which governed tasks each role can perform. Changes apply to the selected hospital only.</p></div></div>
          </div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setCreateRoleOpen(true)} disabled={!organizationId && !isSuperAdmin} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> Create custom role</button><Link href="/settings/users" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-teal-300 hover:text-teal-800"><SlidersHorizontal className="h-3.5 w-3.5" /> Manage users</Link></div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Building2 className="h-4 w-4 text-teal-700" /> Scope</div><div className="mt-2 text-lg font-semibold">{currentOrganization?.name || (isSuperAdmin ? "Platform view" : "Your hospital")}</div><div className="mt-1 text-xs text-slate-500">{currentOrganization ? "Organization-managed roles" : "Super admin access"}</div></div>
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><ShieldCheck className="h-4 w-4 text-teal-700" /> Roles</div><div className="mt-2 text-lg font-semibold">{roles.length}</div><div className="mt-1 text-xs text-slate-500">Hospital-scoped roles</div></div>
          <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Check className="h-4 w-4 text-teal-700" /> Governed tasks</div><div className="mt-2 text-lg font-semibold">{taskRows.length}</div><div className="mt-1 text-xs text-slate-500">From the master task catalog</div></div>
        </section>

        {isSuperAdmin && <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-100 bg-white px-4 py-3 shadow-sm"><div><div className="text-xs font-semibold uppercase tracking-wider text-teal-800">Hospital scope</div><div className="mt-1 text-sm text-slate-500">Choose a hospital to manage its organization roles.</div></div><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className="sr-only">Hospital</span><select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); fetchData(event.target.value); }} className="min-w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"><option value="" disabled>Select a hospital</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><ChevronDown className="-ml-8 h-4 w-4 pointer-events-none text-slate-400" /></label></section>}

        {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {loading ? <div className="flex h-72 items-center justify-center rounded-lg border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div> : <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-sm font-semibold">Access by task</h2><p className="mt-1 text-xs text-slate-500">Select a checkmark to grant or remove a task from an editable hospital role.</p></div><div className="flex items-center gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-700" /> Enabled</span><span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Global roles locked</span></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="sticky left-0 z-10 min-w-[310px] bg-slate-50 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Master task</th>{roles.map((role) => <th key={role.id} className="min-w-[155px] px-3 py-4 text-center align-top"><div className="mx-auto max-w-[145px] text-xs font-semibold leading-5 text-slate-800">{role.definition?.name || role.name}</div><div className="mt-1 text-[11px] font-normal text-slate-400">{role.organizationId ? "Hospital role" : "Global role"}</div><div className="mt-2 text-[11px] font-medium text-teal-700">{enabledCount(role)} / {permissions.length}</div></th>)}</tr></thead><tbody>{modules.map((module) => <>{<tr key={`module-${module}`}><td colSpan={roles.length + 1} className="border-y border-teal-100 bg-teal-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-900">{module}</td></tr>}{taskRows.filter((task) => (task.module || "General") === module).map((task) => { const permissionId = task.permissions[0]?.id; const permission = permissionById.get(permissionId); if (!permissionId) return null; return <tr key={task.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="sticky left-0 z-[1] bg-white px-5 py-4"><div className="font-medium text-slate-800">{task.name}</div><div className="mt-0.5 text-xs text-slate-400">{task.description || permission?.description || task.slug}</div></td>{roles.map((role) => { const checked = role.rolePermissions.some((item) => item.permissionId === permissionId); const editable = editableRole(role); const busy = updatingKey === `${role.id}-${permissionId}`; return <td key={role.id} className="px-3 py-3 text-center"><button type="button" title={editable ? `Toggle ${task.name}` : "Read-only global role"} onClick={() => togglePermission(role, permissionId)} disabled={!editable || busy} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${checked ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-transparent"} ${editable ? "hover:border-teal-500" : "cursor-not-allowed opacity-45"}`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}</button></td>; })}</tr>; })}</> )}</tbody></table></div></section>}

        <footer className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CircleHelp className="h-3.5 w-3.5" /> Super admins can inspect every hospital. Hospital admins can change only their own hospital-scoped roles.</footer>
      </div>
      {createRoleOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><form onSubmit={createRole} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-900">Create custom hospital role</h2><p className="mt-1 text-xs text-slate-500">The new role starts with no permissions.</p></div><button type="button" onClick={() => setCreateRoleOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button></div><div className="space-y-4"><label className="block text-xs font-semibold text-slate-700">Role name<input required value={createRoleName} onChange={(event) => setCreateRoleName(event.target.value)} placeholder="e.g. Clinical Reviewer" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label><label className="block text-xs font-semibold text-slate-700">Description<textarea value={createRoleDescription} onChange={(event) => setCreateRoleDescription(event.target.value)} placeholder="What this role is responsible for" rows={3} className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>{isSuperAdmin && <label className="block text-xs font-semibold text-slate-700">Hospital<select required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"><option value="">Select a hospital</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreateRoleOpen(false)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" disabled={creatingRole || !organizationId} className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{creatingRole ? "Creating..." : "Create role"}</button></div></form></div>}
    </main>
  );
}
