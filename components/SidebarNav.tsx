"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  PlusCircle,
  FolderKanban,
  Building2,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  CreditCard,
  Send,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import type { SessionUser } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Activity },
  { href: "/cases/new", label: "New Case Ingestion", icon: PlusCircle },
  { href: "/admin/cases", label: "Case Management", icon: FolderKanban },
  { href: "/admin/organizations", label: "Hospital Networks", icon: Building2 },
  { href: "/admin/safety-queue", label: "Safety Queue", icon: ShieldAlert },
  { href: "/settings/roles", label: "Role Task Matrix", icon: ShieldCheck },
  { href: "/admin/usage", label: "AI Usage", icon: BarChart3 },
  { href: "/admin/subscription", label: "Subscription", icon: CreditCard },
  { href: "/admin/publishing", label: "Publishing Jobs", icon: Send },
];

/**
 * Colors translated from styles.css:
 * brand indigo #3547d1, active nav bg #3547d1 with white text (matching
 * .department-list button.active), inactive text #4a4e82, hover bg #eef0ff.
 */
export default function SidebarNav({ currentUser }: { currentUser: SessionUser | null }) {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <aside className="w-full shrink-0 border-b border-line bg-surface flex flex-col md:w-64 md:border-b-0 md:border-r">
      <div className="p-4 border-b border-line md:p-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo compact />
        </Link>
      </div>

      <nav className="grid flex-1 grid-cols-2 gap-1 px-3 py-2 md:block md:space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition md:gap-2.5 md:px-3 md:py-2.5 md:text-sm ${
                active
                  ? "bg-pine text-white"
                  : "text-muted hover:bg-pine-tint hover:text-ink"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-white" : "text-muted"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
