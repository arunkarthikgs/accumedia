import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { FileCheck } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import BrandTheme from "@/components/BrandTheme";
import UserAccountMenu from "@/components/UserAccountMenu";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Accumedia | Clinical Intelligence & Governance",
  description:
    "Enterprise clinical transcription, master synthesis, and DPDP/NMC compliance supervision platform.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`h-full antialiased ${jakarta.variable}`}
    >
      <body
        className="min-h-full font-sans text-ink flex flex-col"
        style={{ background: "var(--paper)" }}
      >
        <BrandTheme initialBrandingHex={currentUser?.organizationBrandingHex || null} />
        {/* Sidebar + Content */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <SidebarNav currentUser={currentUser} />
          <div className="flex-1 min-w-0 overflow-y-auto">
            <UserAccountMenu initialUser={currentUser} />
            {children}
          </div>
        </div>

        {/* Global Regulatory Footer — text unchanged */}
        <footer className="border-t border-line bg-surface py-4 text-center text-xs text-muted">
          <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5 text-pine" />
              <span>Accumedia Clinical Intelligence Platform &copy; {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>NMC Code of Medical Ethics (2023)</span>
              <span>•</span>
              <span>DPDP Act 2023 PHI Compliance</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
