"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Asset QR scanner with an accessible manual entry alternative (spec §14.3). */
export default function ScanPage() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const handle = (raw: string) => {
    const token = raw.includes("/passport/") ? raw.split("/passport/")[1].split(/[?#]/)[0] : raw.trim();
    if (token) router.push(`/passport/${encodeURIComponent(token)}`);
  };

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
    if (!Ctor) { setMsg("Camera scanning is not supported in this browser. Enter the code manually."); setActive(false); return; }
    const detector = new Ctor({ formats: ["qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(async (s) => {
      stream = s;
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      const loop = async () => {
        if (stop || !video.current) return;
        try { const r = await detector.detect(video.current); if (r[0]) { handle(r[0].rawValue); return; } } catch { /* keep scanning */ }
        requestAnimationFrame(loop);
      };
      loop();
    }).catch(() => { setMsg("Camera permission denied. Enter the code manually."); setActive(false); });
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="mobile-frame">
      <PageHeader icon="ScanLine" title="Scan asset" subtitle="Scan an equipment QR passport. Access is checked against your role and site scope." />
      <div className="card"><div className="card-body stack">
        {msg && <Alert tone="warn">{msg}</Alert>}
        {active ? <video ref={video} style={{ width: "100%", borderRadius: 8, background: "#000" }} muted playsInline aria-label="Camera preview" />
          : <button className="btn btn-primary big-btn" onClick={() => { setMsg(null); setActive(true); }}><Icon name="Camera" size={18} />Start camera</button>}
        <form className="stack" onSubmit={(e) => { e.preventDefault(); handle(manual); }}>
          <div className="field"><label htmlFor="code">Or enter the code / URL printed under the QR label</label><input id="code" className="input" value={manual} onChange={(e) => setManual(e.target.value)} /></div>
          <button className="btn big-btn" disabled={!manual.trim()}><Icon name="Search" size={18} />Open passport</button>
        </form>
      </div></div>
    </div>
  );
}
