"use client";
import { AssetClassPicker } from "./AssetClassPicker";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { FieldDef, ResourceDef } from "@/lib/registry";
import { browserZone, fromLocalInput, humanize, toLocalInput } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { Alert } from "./ui";

export function RefSelect({ path, value, label, onChange, id, invalid, filter }: {
  path: string; value: string | null; label?: string | null; onChange: (id: string | null, label: string | null) => void;
  id?: string; invalid?: boolean; filter?: { field: string; value: string };
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(label ?? null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setCurrent(label ?? null), [label]);
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filter) { params.set("field", filter.field); params.set("value", filter.value); }
      api<{ id: string; label: string }[]>(`/${path}/options?${params}`).then(setOpts).catch(() => setOpts([]));
    }, 200);
    return () => clearTimeout(h);
  }, [q, open, path, filter]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={box} style={{ position: "relative" }}>
      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
        <input
          id={id}
          className="input"
          aria-invalid={invalid}
          role="combobox"
          aria-expanded={open}
          placeholder={current ?? "…"}
          value={open ? q : current ?? ""}
          onFocus={() => { setOpen(true); setQ(""); }}
          onChange={(e) => setQ(e.target.value)}
        />
        {value && <button type="button" className="btn btn-ghost icon-btn" aria-label="Clear" onClick={() => { onChange(null, null); setCurrent(null); }}><Icon name="X" size={16} /></button>}
      </div>
      {open && (
        <div className="search-results" role="listbox" style={{ top: 40 }}>
          {opts.length === 0 ? <div className="state small" style={{ padding: 16 }}>No matches</div> : opts.map((o) => (
            <button type="button" key={o.id} role="option" aria-selected={o.id === value} className="search-item" style={{ width: "100%", border: 0, background: o.id === value ? "var(--accent-soft)" : "none", font: "inherit", textAlign: "left", cursor: "pointer" }}
              onClick={() => { onChange(o.id, o.label); setCurrent(o.label); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldInput({ f, value, label, onChange, error }: {
  f: FieldDef; value: unknown; label?: string | null; onChange: (v: unknown, label?: string | null) => void; error?: string;
}) {
  const t = useT();
  const id = `f-${f.name}`;
  const invalid = !!error;
  let control: React.ReactNode;
  switch (f.type) {
    case "text":
      control = <textarea id={id} className="textarea" aria-invalid={invalid} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "enum":
      control = (
        <select id={id} className="select" aria-invalid={invalid} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t("Select…")}</option>
          {f.options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
        </select>
      );
      break;
    case "bool":
      control = <label className="checkbox"><input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
      break;
    case "int":
    case "dec":
    case "money":
      control = <input id={id} className="input" type="number" inputMode="decimal" step={f.type === "int" ? 1 : "any"} aria-invalid={invalid} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
      break;
    case "date":
      control = <input id={id} className="input" type="date" aria-invalid={invalid} value={(value as string)?.slice(0, 10) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case "datetime":
      control = <input id={id} className="input" type="datetime-local" aria-invalid={invalid} value={toLocalInput(value)} onChange={(e) => onChange(fromLocalInput(e.target.value))} />;
      break;
    case "ref":
      control = <RefSelect id={id} path={f.ref!} value={(value as string) ?? null} label={label} invalid={invalid} onChange={(v, l) => onChange(v, l)} />;
      break;
    default:
      control = <input id={id} className="input" aria-invalid={invalid} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={`field ${f.type === "text" ? "wide" : ""}`}>
      {f.type !== "bool" && <label htmlFor={id}>{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}</label>}
      {control}
      {f.type === "datetime" && <span className="hint">{t("Times shown in")} {browserZone()}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

export function editableFields(def: ResourceDef, creating: boolean): FieldDef[] {
  return def.fields.filter((f) => !f.managed && !f.computed && (creating || !f.guarded));
}

/** Generic create/edit form driven by the resource model; server validation errors map to fields. */
export function RecordForm({ def, initial, onSaved, onCancel, defaults }: {
  def: ResourceDef; initial?: Record<string, unknown> | null; onSaved: (row: Record<string, unknown>) => void; onCancel: () => void;
  defaults?: Record<string, unknown>;
}) {
  const t = useT();
  const creating = !initial;
  // Asset class and its specifications have their own catalog-driven editor.
  const fields = editableFields(def, creating).filter((f) => !(def.path === "assets" && (f.name === "assetClassId" || f.name === "specs")));
  const catalogFields = def.path === "assets" ? ["assetClassId", "specs"] : [];
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(defaults ?? {}), ...(initial ?? {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idemKey = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

  const set = (name: string, v: unknown, lbl?: string | null) => setValues((x) => ({ ...x, [name]: v, ...(lbl !== undefined ? { [`${name}Label`]: lbl } : {}) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.required && f.type !== "bool" && (v === null || v === undefined || v === "")) errs[f.name] = `${f.label} is required`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) { setFormError(t("Please complete the highlighted fields.")); return; }
    setSaving(true);
    setFormError(null);
    const body: Record<string, unknown> = {};
    for (const f of fields) if (values[f.name] !== undefined) body[f.name] = values[f.name];
    for (const n of catalogFields) if (values[n] !== undefined) body[n] = values[n];
    try {
      const row = creating
        ? await api<Record<string, unknown>>(`/${def.path}`, { body, headers: { "Idempotency-Key": idemKey.current } })
        : await api<Record<string, unknown>>(`/${def.path}/${initial!.id}`, { method: "PATCH", body, headers: { "If-Match": String(initial!.version) } });
      onSaved(row);
    } catch (err) {
      const ae = err as ApiError;
      const fe: Record<string, string> = {};
      for (const x of ae.errors ?? []) fe[x.field] = x.message;
      setErrors(fe);
      setFormError(ae.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="card-body stack">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {def.path === "assets" && <AssetClassPicker values={values} creating={creating} set={(n, v) => set(n, v)} />}
        <div className="form-grid">
          {fields.map((f) => (
            <FieldInput key={f.name} f={f} value={values[f.name]} label={values[`${f.name}Label`] as string | null} error={errors[f.name]} onChange={(v, l) => set(f.name, v, l)} />
          ))}
        </div>
      </div>
      <div className="card-foot">
        <span className="small muted"><span style={{ color: "var(--danger)" }}>*</span> {t("Required")}</span>
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>{t("Cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}><Icon name="Save" size={16} />{saving ? t("Saving…") : creating ? `${t("Create")} — ${def.singular.toLowerCase()}` : t("Save changes")}</button>
        </div>
      </div>
    </form>
  );
}
