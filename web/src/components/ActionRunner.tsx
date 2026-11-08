"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ActionField } from "@/lib/actions";
import { browserZone, fromLocalInput, humanize, toLocalInput } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { RefSelect } from "./fields";
import { Alert, Modal } from "./ui";

export interface RunSpec {
  title: string;
  endpoint: string;
  fields?: ActionField[];
  confirm?: string;
  danger?: boolean;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  submitLabel?: string;
}

/** Collects command input, posts it and reports the server's guard messages verbatim. */
export function ActionRunner({ spec, onClose, onDone }: { spec: RunSpec; onClose: () => void; onDone: (result: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    for (const f of spec.fields ?? []) {
      if (f.required && f.type !== "bool" && (values[f.name] === undefined || values[f.name] === "" || values[f.name] === null)) {
        setError(`${f.label} is required`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...(spec.body ?? {}), ...values };
      for (const f of spec.fields ?? []) if (f.type === "bool" && body[f.name] === undefined) body[f.name] = false;
      const r = await api<Record<string, unknown>>(spec.endpoint, { method: "POST", body, headers: spec.headers });
      onDone(r);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={spec.title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${spec.danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={() => submit()}>
          <Icon name={spec.danger ? "TriangleAlert" : "Check"} size={16} />{busy ? "Working…" : spec.submitLabel ?? "Confirm"}
        </button>
      </>
    }>
      <form className="stack" onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        {spec.confirm && <p>{spec.confirm}</p>}
        {!spec.confirm && !(spec.fields?.length) && <p>Proceed with <strong>{spec.title.toLowerCase()}</strong>?</p>}
        {(spec.fields ?? []).map((f) => {
          const id = `a-${f.name}`;
          if (f.type === "bool") {
            return <label key={f.name} className="checkbox"><input id={id} type="checkbox" checked={!!values[f.name]} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.checked }))} />{f.label}</label>;
          }
          return (
            <div className="field" key={f.name}>
              <label htmlFor={id}>{f.label}{f.required && <span className="req">*</span>}</label>
              {f.type === "textarea" ? (
                <textarea id={id} className="textarea" value={(values[f.name] as string) ?? ""} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))} />
              ) : f.type === "enum" ? (
                <select id={id} className="select" value={(values[f.name] as string) ?? ""} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))}>
                  <option value="">Select…</option>
                  {f.options!.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
                </select>
              ) : f.type === "datetime" ? (
                <>
                  <input id={id} className="input" type="datetime-local" value={toLocalInput(values[f.name])} onChange={(e) => setValues((x) => ({ ...x, [f.name]: fromLocalInput(e.target.value) }))} />
                  <span className="hint">Times in {browserZone()}</span>
                </>
              ) : f.type === "ref" ? (
                <RefSelect id={id} path={f.ref!} value={(values[f.name] as string) ?? null} onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))} />
              ) : (
                <input id={id} className="input" type={f.type === "number" ? "number" : "text"} step="any" value={(values[f.name] as string) ?? ""} onChange={(e) => setValues((x) => ({ ...x, [f.name]: e.target.value }))} />
              )}
            </div>
          );
        })}
      </form>
    </Modal>
  );
}
