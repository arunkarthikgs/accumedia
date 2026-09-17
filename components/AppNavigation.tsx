"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";

interface NavItem {
  name: string;
  href: string;
  badge?: string;
  icon: (active: boolean) => React.ReactNode;
}

export default function AppNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; specialty?: string | null; designation?: string | null; qualifications?: string | null; isSuperAdmin?: boolean; permissions?: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setCurrentUser(data?.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  const mainNav: NavItem[] = [
    {
      name: "Dashboard & Feed",
      href: "/",
      icon: (active) => (
        <svg className={`w-5 h-5 ${active ? "text-pine" : "text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      name: "New Clinical Case",
      href: "/cases/new",
      badge: "Intake",
      icon: (active) => (
        <svg className={`w-5 h-5 ${active ? "text-pine" : "text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      name: "Safety Gate",
      href: "/cases/active/review",
      badge: "DPDP",
      icon: (active) => (
        <svg className={`w-5 h-5 ${active ? "text-pine" : "text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      name: "Omnichannel Studio",
      href: "/admin/cases",
      badge: "6 Formats",
      icon: (active) => (
        <svg className={`w-5 h-5 ${active ? "text-pine" : "text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
  ];

  const adminNav: NavItem[] = [
    {
      name: "Clinicians & Team",
      href: "/settings/users",
      icon: (active) => (
        <svg className={`w-5 h-5 ${active ? "text-pine" : "text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ];

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href.replace("/active", ""));
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 bg-surface border-r border-line shrink-0 select-none">
        {/* Brand Banner */}
        <div className="p-6 border-b border-line flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo compact />
          </Link>
        </div>

        {/* Database Status Tag */}
        <div className="px-6 py-3 bg-paper border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sage animate-pulse" />
            <span className="text-[11px] font-medium text-muted">AWS RDS (macula)</span>
          </div>
          <span className="text-[10px] bg-pine-tint text-pine px-2 py-0.5 rounded font-mono">v15 App</span>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 px-4 py-6 space-y-8 overflow-y-auto">
          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Workflow Hub</p>
            <nav className="space-y-1">
              {mainNav.map((item) => {
                const active = isLinkActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      active
                        ? "bg-pine-tint text-pine border border-pine/20 shadow-sm"
                        : "text-muted hover:text-ink hover:bg-paper"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon(active)}
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          active ? "bg-pine-tint text-pine" : "bg-paper text-muted"
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Governance & Team</p>
            <nav className="space-y-1">
              {adminNav.map((item) => {
                const active = isLinkActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                      active
                        ? "bg-pine-tint text-pine border border-pine/20 shadow-sm"
                        : "text-muted hover:text-ink hover:bg-paper"
                    }`}
                  >
                    {item.icon(active)}
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden bg-surface text-ink border-b border-line px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-pine text-white flex items-center justify-center font-bold text-sm">M</div>
            <span className="font-bold text-xs tracking-tight">ACCUMEDIA</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-paper text-muted"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </header>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-surface border-b border-line p-4 space-y-2">
            {[...mainNav, ...adminNav].map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 text-xs font-semibold text-muted hover:text-pine"
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}

        {/* Page Container */}
        <main className="flex-1 p-6 lg:p-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
