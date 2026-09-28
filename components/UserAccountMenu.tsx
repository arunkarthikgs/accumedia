"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UserCircle } from "lucide-react";

type CurrentUser = {
  name: string;
  email: string;
  designation?: string | null;
  specialty?: string | null;
};

export default function UserAccountMenu({ initialUser }: { initialUser: CurrentUser | null }) {
  const pathname = usePathname();
  const user = initialUser;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user || pathname === "/reset-password") return null;

  const initials = user.name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <div className="flex min-w-0 max-w-[40vw] items-center gap-2 sm:max-w-[16rem]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pine text-[10px] font-bold text-white">{initials}</span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink" title={user.name}>{user.name}</span>
            <span className="hidden truncate text-[10px] text-muted sm:block">{user.designation || user.specialty || user.email}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/settings/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><UserCircle className="h-3.5 w-3.5" /> My Profile</Link>
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-xs font-semibold text-brick hover:underline"><LogOut className="h-3.5 w-3.5" /> Logout</button>
        </div>
      </div>
    </header>
  );
}
