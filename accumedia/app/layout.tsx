import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accumedia | Clinical Compliance & Synthesis",
  description: "NMC & DPDP Compliant Clinical Automation for Indian Hospitals",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const canManagePrompts = user?.permissions.includes("PROMPT_MANAGE");
  const canManageRoles = user?.permissions.includes("ROLE_MATRIX_MANAGE");

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen font-sans">
        <header className="border-b bg-white sticky top-0 z-30 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-teal-800 tracking-tight flex items-center gap-2">
              <span className="bg-teal-700 text-white rounded p-1 text-xs">MH</span>
              MACULA <span className="text-slate-500 font-normal">HEALTHCARE</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-teal-700 transition-colors">Dashboard</Link>
              <Link href="/cases/new" className="hover:text-teal-700 transition-colors">+ New Clinical Case</Link>
              {canManagePrompts && (
                <Link href="/settings/prompts" className="hover:text-teal-700 transition-colors">
                  Compliance Prompt
                </Link>
              )}
              {canManageRoles && (
                <Link href="/settings/roles" className="text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md text-xs font-semibold hover:bg-teal-100 transition-colors">
                  Role Matrix
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
