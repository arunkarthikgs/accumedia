import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "Clinical Insight";
  const doctor = searchParams.get("doctor") || "Dr. Priya Karthikeyan";
  const specialty = searchParams.get("specialty") || "Ophthalmology";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#090d16",
          padding: "60px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#059669" }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: "#10b981", letterSpacing: "0.05em" }}>
            MACULA HEALTHCARE • CLINICAL SPOTLIGHT
          </span>
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.2, color: "#f8fafc" }}>
          {title}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "2px solid #1e293b", paddingTop: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{doctor}</span>
            <span style={{ fontSize: 16, color: "#94a3b8" }}>{specialty}</span>
          </div>
          <span style={{ fontSize: 14, color: "#64748b" }}>Registered Medical Knowledge Asset</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
