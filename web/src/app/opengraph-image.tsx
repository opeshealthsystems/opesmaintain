import { ImageResponse } from "next/og";

// Social preview image (WhatsApp, LinkedIn, Facebook, X) for every public page.
export const alt = "OPES Maintain — maintenance management software for Cameroon and Africa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0c1a29", color: "#eef3f8", padding: "72px 80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: "#13263a", border: "2px solid #26405b", borderBottom: "6px solid #e9a23b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff" }}>OM</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#fff" }}>OPES Maintain</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, color: "#fff", maxWidth: 1000 }}>Maintenance management software for Africa</div>
          <div style={{ fontSize: 32, color: "#a9b8c9" }}>Assets · Work orders · Preventive maintenance · Offline mobile app · EN / FR</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#a9b8c9" }}>
          <div style={{ width: 18, height: 18, background: "#e9a23b", borderRadius: 3, marginTop: 6 }} /> opesmaintain.com · Opesware Technologies · Douala, Cameroon
        </div>
      </div>
    ),
    size,
  );
}
