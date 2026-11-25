"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RefSelect } from "@/components/fields";
import { Alert, PageHeader, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";

type Answer = "PASS" | "FAIL" | "N/A";

/** Guided digital inspection (OM-M12): the template's questions become a pass/fail checklist. */
export default function Inspect() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [templateId, setTemplateId] = useState<string | null>(sp.get("templateId"));
  const [assetId, setAssetId] = useState<string | null>(sp.get("assetId"));
  const [workOrderId, setWorkOrderId] = useState<string | null>(sp.get("workOrderId"));
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [defects, setDefects] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAnswers({});
    setTemplate(null);
    if (templateId) api<Record<string, unknown>>(`/inspection-templates/${templateId}`).then(setTemplate).catch((e) => setError(e.message));
  }, [templateId]);

  const questions = useMemo(() => String(template?.questions ?? "").split("\n").map((q) => q.trim()).filter(Boolean), [template]);
  const answered = questions.filter((_, i) => answers[i]).length;
  const failed = questions.filter((_, i) => answers[i] === "FAIL");
  const scored = questions.filter((_, i) => answers[i] && answers[i] !== "N/A").length;
  const score = scored ? Math.round((100 * questions.filter((_, i) => answers[i] === "PASS").length) / scored) : 0;
  const threshold = Number(template?.passThreshold ?? 100);
  const outcome = failed.length ? "FAIL" : score >= threshold ? "PASS" : "CONDITIONAL";

  const submit = async () => {
    setError(null);
    if (!assetId) { setError("Select the asset being inspected."); return; }
    if (answered < questions.length) { setError(`Answer all ${questions.length} items (${questions.length - answered} left).`); return; }
    if (failed.length && !defects.trim()) { setError("Describe the defects found for the failed items."); return; }
    setBusy(true);
    try {
      const text = questions.map((q, i) => `${q}: ${answers[i]}${notes[i] ? ` — ${notes[i]}` : ""}`).join("\n");
      const r = await api<Record<string, unknown>>("/inspection-results", { body: { templateId, assetId, workOrderId, performedAt: new Date().toISOString(), answers: text, score, outcome, defectsFound: defects || null } });
      toast(outcome === "FAIL" ? "Inspection recorded — a follow-up work order was created" : "Inspection recorded");
      router.replace(`/m/inspection-results/${r.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader icon="ClipboardCheck" title="Perform inspection" subtitle="Answer each checklist item. A failed item creates a corrective work order automatically."
        crumbs={[{ href: "/m/inspection-results", label: "Inspection Results" }, { label: "Perform" }]} />
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="card"><div className="card-body form-grid">
          <div className="field"><label htmlFor="tpl">Template<span className="req">*</span></label>
            <RefSelect id="tpl" path="inspection-templates" value={templateId} label={template ? String(template._label) : null} filter={{ field: "status", value: "PUBLISHED" }} onChange={(v) => setTemplateId(v)} /></div>
          <div className="field"><label htmlFor="ast">Asset<span className="req">*</span></label>
            <RefSelect id="ast" path="assets" value={assetId} onChange={(v) => setAssetId(v)} /></div>
          <div className="field"><label htmlFor="wo">Work order (optional)</label>
            <RefSelect id="wo" path="work-orders" value={workOrderId} onChange={(v) => setWorkOrderId(v)} /></div>
        </div></div>
        {template && (
          <div className="card">
            <div className="card-head"><h2>{String(template.name)}</h2><span className="small muted">{answered}/{questions.length} answered · pass threshold {threshold}%</span></div>
            {questions.map((q, i) => (
              <fieldset key={i} className="check-item" style={{ border: 0, borderBottom: "1px solid var(--border)", margin: 0, flexWrap: "wrap" }}>
                <legend className="sr-only">{q}</legend>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{i + 1}. {q}</div>
                  <input className="input" style={{ marginTop: 6, height: 32 }} placeholder="Note (optional)" aria-label={`Note for item ${i + 1}`} value={notes[i] ?? ""} onChange={(e) => setNotes({ ...notes, [i]: e.target.value })} />
                </div>
                <div className="row" role="radiogroup" aria-label={`Result for item ${i + 1}`}>
                  {(["PASS", "FAIL", "N/A"] as Answer[]).map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={answers[i] === a}
                      className={`btn btn-sm ${answers[i] === a ? (a === "FAIL" ? "btn-danger" : "btn-primary") : ""}`}
                      style={answers[i] === a && a === "FAIL" ? { background: "var(--danger-soft)" } : undefined}
                      onClick={() => setAnswers({ ...answers, [i]: a })}>
                      <Icon name={a === "PASS" ? "Check" : a === "FAIL" ? "X" : "Minus"} size={14} />{a === "N/A" ? "N/A" : a === "PASS" ? "Pass" : "Fail"}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="card-body stack">
              {failed.length > 0 && (
                <div className="field"><label htmlFor="def">Defects found<span className="req">*</span></label>
                  <textarea id="def" className="textarea" value={defects} onChange={(e) => setDefects(e.target.value)} /></div>
              )}
              <div className="row between">
                <span>Score <strong>{score}%</strong> · outcome <strong>{outcome === "FAIL" ? "Fail" : outcome === "PASS" ? "Pass" : "Conditional"}</strong></span>
                <button className="btn btn-primary" disabled={busy} onClick={submit}><Icon name="Save" size={16} />{busy ? "Saving…" : "Record inspection"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
