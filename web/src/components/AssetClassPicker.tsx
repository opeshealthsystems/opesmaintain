"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

type Spec = { key: string; label: string; type: string; required: boolean };
export type CatalogClass = { id: string; name: string; criticality: string; assetType: string; expectedLifespanYears: number; pmTemplates: number; specs: Spec[] };

const CRIT: Record<string, string> = { CRITICAL: "A_CRITICAL", HIGH: "B_HIGH", MEDIUM: "C_MEDIUM", LOW: "D_LOW" };
/** Spec keys that already exist as regular asset fields. */
const NATIVE: Record<string, string> = { manufacturer: "manufacturer", model: "model", serial_number: "serialNumber", serialNumber: "serialNumber" };

/**
 * Asset class picker for the asset form: choosing a catalog class fills type, criticality, category and lifespan,
 * and shows the class's specification fields (stored as JSON in `specs`). PM plans are created by the server.
 */
export function AssetClassPicker({ values, set, creating }: {
  values: Record<string, unknown>; set: (name: string, v: unknown) => void; creating: boolean;
}) {
  const { user } = useAuth();
  const fr = user?.language === "FR";
  const [classes, setClasses] = useState<CatalogClass[] | null>(null);
  useEffect(() => {
    api<CatalogClass[]>("/catalog/selected").then(setClasses).catch(() => setClasses([]));
  }, []);
  const current = classes?.find((c) => c.id === values.assetClassId);
  let specs: Record<string, unknown> = {};
  try { specs = values.specs ? JSON.parse(String(values.specs)) : {}; } catch { specs = {}; }

  const choose = (id: string) => {
    const c = classes?.find((x) => x.id === id);
    set("assetClassId", c ? c.id : null);
    if (!c) return;
    set("assetType", c.assetType);
    set("criticality", CRIT[c.criticality] ?? values.criticality);
    set("category", c.name);
    if (c.expectedLifespanYears) set("expectedLifeYears", c.expectedLifespanYears);
  };
  const setSpec = (key: string, v: string) => {
    if (NATIVE[key]) { set(NATIVE[key], v); return; }
    const next = { ...specs, [key]: v === "" ? undefined : v };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    set("specs", Object.keys(next).length ? JSON.stringify(next) : null);
  };

  if (classes === null) return null;
  return (
    <div className="asset-class-box">
      <div className="field">
        <label htmlFor="f-assetClassId">{fr ? "Type d'équipement (catalogue OPES)" : "Equipment type (OPES catalog)"}</label>
        {classes.length ? (
          <select id="f-assetClassId" className="select" value={(values.assetClassId as string) ?? ""} onChange={(e) => choose(e.target.value)} disabled={!creating && !!values.assetClassId}>
            <option value="">{fr ? "Autre / hors catalogue" : "Other / not in the catalog"}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {fr ? "Aucun type d'équipement choisi pour cet espace. " : "No equipment types chosen for this workspace yet. "}
            <Link href="/onboarding">{fr ? "Choisir dans le catalogue" : "Choose from the catalog"}</Link>
          </p>
        )}
        {current && creating && (
          <span className="hint"><Icon name="CalendarClock" size={13} /> {fr
            ? `${current.pmTemplates} plan(s) de maintenance préventive seront créés en brouillon pour cet équipement.`
            : `${current.pmTemplates} preventive maintenance plan(s) will be created as drafts for this asset.`}</span>
        )}
      </div>
      {current && current.specs.some((s) => !NATIVE[s.key]) && (
        <div className="form-grid">
          {/* Manufacturer, model and serial number are regular asset fields below; only class-specific specs here. */}
          {current.specs.filter((s) => !NATIVE[s.key]).map((s) => {
            const id = `spec-${s.key}`;
            const v = NATIVE[s.key] ? values[NATIVE[s.key]] : specs[s.key];
            return (
              <div className="field" key={s.key}>
                <label htmlFor={id}>{s.label}{s.required && <span className="req" aria-hidden="true">*</span>}</label>
                <input id={id} className="input" type={s.type === "number" ? "number" : s.type === "date" ? "date" : "text"} inputMode={s.type === "number" ? "decimal" : undefined}
                  value={v === null || v === undefined ? "" : String(v)} onChange={(e) => setSpec(s.key, e.target.value)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
