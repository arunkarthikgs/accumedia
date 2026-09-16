export default function BrandLogo({ compact = false, invert = false }: { compact?: boolean; invert?: boolean }) {
  return (
    <img
      src="/macula-healthcare-logo.png"
      alt="Macula Healthcare Consultants Platform"
      width={compact ? 170 : 230}
      height={compact ? 99 : 134}
      className={`${compact ? "h-12 w-auto" : "h-16 w-auto"} object-contain ${invert ? "rounded bg-white p-1" : ""}`}
    />
  );
}
