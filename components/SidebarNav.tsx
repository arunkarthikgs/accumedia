"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  PlusCircle,
  FolderKanban,
  Building2,
  ShieldAlert,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Activity },
  { href: "/cases/new", label: "New Case Ingestion", icon: PlusCircle },
  { href: "/admin/cases", label: "Case Management", icon: FolderKanban },
  { href: "/admin/organizations", label: "Hospital Networks", icon: Building2 },
  { href: "/admin/safety-queue", label: "Safety Queue", icon: ShieldAlert },
];

/**
 * Colors translated from styles.css:
 * brand indigo #3547d1, active nav bg #3547d1 with white text (matching
 * .department-list button.active), inactive text #4a4e82, hover bg #eef0ff.
 */
export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-b border-line bg-surface flex flex-col md:w-64 md:border-b-0 md:border-r">
      <div className="p-6 border-b border-line">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine text-white shadow-xs">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-ink leading-none">
              Macula
            </div>
            <div className="text-xs font-semibold text-pine">Clinical</div>
          </div>
        </Link>
      </div>

      <div className="px-6 py-4">
        <Link
          href="/cases/new"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-pine px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-pine-dark transition"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Dictate Case</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
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
