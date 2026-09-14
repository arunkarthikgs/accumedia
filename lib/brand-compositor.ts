import sharp from "sharp";
import type { OverlayOptions } from "sharp";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" })[character] || character);
}

export async function applyBrandOverlay(input: Buffer, options: { accent: string; logoUrl?: string | null; title: string; tagline?: string | null; disclaimer?: string | null; font?: string | null }) {
  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const logo = options.logoUrl ? await fetch(options.logoUrl).then(async (response) => response.ok ? Buffer.from(await response.arrayBuffer()) : null).catch(() => null) : null;
  const overlays: OverlayOptions[] = [];
  const font = escapeXml(options.font || "Arial");
  const title = escapeXml(options.title.slice(0, 120));
  const tagline = escapeXml((options.tagline || "").slice(0, 120));
  const disclaimer = escapeXml((options.disclaimer || "").slice(0, 180));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="${Math.max(0, height - 170)}" width="${width}" height="170" fill="#ffffff" fill-opacity="0.9"/><rect x="0" y="${Math.max(0, height - 170)}" width="12" height="170" fill="${escapeXml(options.accent)}"/><text x="36" y="${Math.max(40, height - 112)}" font-family="${font}" font-size="${Math.max(24, Math.round(width / 32))}" font-weight="700" fill="#13211f">${title}</text><text x="36" y="${Math.max(72, height - 78)}" font-family="${font}" font-size="${Math.max(14, Math.round(width / 80))}" fill="${escapeXml(options.accent)}">${tagline}</text><text x="36" y="${Math.max(96, height - 38)}" font-family="${font}" font-size="${Math.max(12, Math.round(width / 90))}" fill="#52615d">${disclaimer}</text></svg>`;
  overlays.push({ input: Buffer.from(svg) });
  if (logo) overlays.push({ input: await sharp(logo).resize(Math.round(width * 0.16), Math.round(height * 0.16), { fit: "inside" }).png().toBuffer(), gravity: "northeast", top: 28, left: 28 });
  return image.composite(overlays).png().toBuffer();
}