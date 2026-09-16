"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, UserCircle } from "lucide-react";

type CurrentUser = {
  name: string;
  email: string;
  designation?: string | null;
  specialty?: string | null;
};

export default function UserAccountMenu({ initialUser }: { initialUser: CurrentUser | null }) {
  const [user, setUser] = useState<CurrentUser | null>(initialUser);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user) return null;

  const initials = user.name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="flex max-w-[16rem] items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pine text-[10px] font-bold text-white">{initials}</span>
        <span className="min-w-0 hidden sm:block"><span className="block truncate text-xs font-semibold text-ink">{user.name}</span><span className="block truncate text-[10px] text-muted">{user.designation || user.specialty || user.email}</span></span>
      </div>
      <Link href="/settings/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"><UserCircle className="h-3.5 w-3.5" /> My Profile</Link>
      <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-xs font-semibold text-brick hover:underline"><LogOut className="h-3.5 w-3.5" /> Logout</button>
    </div>
  );
}
