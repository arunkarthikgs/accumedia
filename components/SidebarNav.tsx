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
  Bot,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import type { SessionUser } from "@/lib/auth";

const NAV_ITEMS: { href: string; label: string; icon: typeof Activity; permission?: string }[] = [
  { href: "/", label: "Home", icon: Activity },
  { href: "/cases/new", label: "New Case Ingestion", icon: PlusCircle },
  { href: "/admin/cases", label: "Case Management", icon: FolderKanban },
  { href: "/admin/organizations", label: "Hospital Networks", icon: Building2 },
  { href: "/admin/safety-queue", label: "Safety Queue", icon: ShieldAlert },
  { href: "/admin/compliance/prompts", label: "Prompt Management", icon: Bot, permission: "PROMPT_MANAGE" },
  { href: "/settings/roles", label: "Role Task Matrix", icon: ShieldCheck },
  { href: "/admin/usage", label: "AI Usage", icon: BarChart3 },
  { href: "/admin/subscription", label: "Subscription", icon: CreditCard },
  { href: "/admin/publishing", label: "Publishing Jobs", icon: Send },
];

/**
 * The active state uses a light plum surface against the dark sidebar.
 */
export default function SidebarNav({ currentUser }: { currentUser: SessionUser | null }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || currentUser?.isSuperAdmin || currentUser?.permissions.includes(item.permission));

  if (pathname === "/login" || pathname === "/reset-password") return null;

  return (
    <aside className="flex w-full shrink-0 flex-row items-center border-b border-white/10 bg-pine-dark text-white md:w-[260px] md:flex-col md:items-stretch md:border-b-0 md:border-r">
      <div className="shrink-0 border-r border-white/10 p-3 md:border-b md:border-r-0 md:p-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo compact />
        </Link>
      </div>

      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-3 md:block md:flex-none md:space-y-1 md:overflow-visible md:px-3 md:py-2">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex w-max shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition md:w-full md:shrink md:whitespace-normal md:gap-2.5 md:px-3 md:py-2.5 md:text-sm ${
                active
                  ? "bg-pine-tint text-pine-dark font-semibold"
                  : "text-plum-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-pine-dark" : "text-plum-200"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
