import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  section: string;
  title: string;
  description: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export default function PageHeader({
  section,
  title,
  description,
  actions,
  backHref = "/",
  backLabel = "Dashboard",
}: PageHeaderProps) {
  return (
    <header className="bg-transparent">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pine">
            <Link href={backHref} className="flex items-center gap-1 hover:underline">
              <ArrowLeft className="h-3 w-3" /> {backLabel}
            </Link>
            <span>/</span>
            <span>{section}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{actions}</div>}
      </div>
    </header>
  );
}
