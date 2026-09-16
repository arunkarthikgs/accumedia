import type { Metadata } from "next";
import { Poppins, Libre_Baskerville, Manrope } from "next/font/google";
import { FileCheck } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
import BrandTheme from "@/components/BrandTheme";
import UserAccountMenu from "@/components/UserAccountMenu";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

/**
 * Fonts translated from the uploaded styles.css:
 * Poppins = body/UI (was Inter), Libre Baskerville = serif for big numbers
 * and headings, Manrope = secondary/data text. DM Mono from the source file
 * is skipped — it was only used for form/table-heavy contexts (readiness
 * tables, mono data cells) that don't have an equivalent anywhere in this
 * app yet; easy to add later if a page needs it.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Macula Healthcare | Clinical Intelligence & Governance",
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
      className={`h-full antialiased ${poppins.variable} ${baskerville.variable} ${manrope.variable}`}
    >
      <body
        className="min-h-full font-sans text-ink flex flex-col"
        style={{ background: "var(--paper)" }}
      >
        <BrandTheme />
        {/* Sidebar + Content */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <SidebarNav />
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="flex justify-end border-b border-line bg-paper px-6 py-3 md:px-8">
              <UserAccountMenu initialUser={currentUser} />
            </div>
            {children}
          </div>
        </div>

        {/* Global Regulatory Footer — text unchanged */}
        <footer className="border-t border-line bg-surface py-4 text-center text-xs text-muted">
          <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5 text-pine" />
              <span>Macula Clinical Intelligence Platform &copy; {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>NMC Code of Medical Ethics (2023)</span>
              <span>•</span>
              <span>DPDP Act 2023 PHI Compliance</span>
              <span>•</span>
              <span>HIPAA BAA Storage</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
