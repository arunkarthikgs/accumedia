import type { Metadata } from "next";
import { Poppins, Libre_Baskerville, Manrope } from "next/font/google";
import { ShieldCheck, FileCheck } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${poppins.variable} ${baskerville.variable} ${manrope.variable}`}
    >
      <body
        className="min-h-full font-sans text-ink flex flex-col"
        style={{ background: "var(--paper)" }}
      >
        {/* Top Regulatory Compliance & Supervision Banner — text unchanged */}
        <div className="bg-pine-dark px-4 py-2 text-center text-[11px] font-medium text-pine-tint border-b border-pine flex items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-pine-tint" />
          <span>
            Operating under <strong>NMC Registered Medical Practitioner (RMP) Supervision</strong> &amp; <strong>DPDP Act Data Protection</strong>
          </span>
        </div>

        {/* Sidebar + Content */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <SidebarNav />
          <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
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
