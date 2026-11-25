import raw from "@/generated/registry.json";

export type FieldType = "str" | "text" | "int" | "dec" | "money" | "bool" | "date" | "datetime" | "enum" | "ref";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  ref: string | null;
  options: string[];
  required: boolean;
  list: boolean;
  managed: boolean;
  computed: boolean;
  guarded: boolean;
}

export interface ResourceDef {
  path: string;
  entity: string;
  context: string;
  module: string;
  label: string;
  singular: string;
  icon: string;
  prefix: string | null;
  display: string;
  readonly: boolean;
  writerRoles: string[];
  desc: string;
  fields: FieldDef[];
}

export interface ModuleDef {
  code: string;
  title: string;
  group: string;
  icon: string;
}

export const modules = raw.modules as Record<string, ModuleDef>;
export const resources = raw.resources as ResourceDef[];
const byPath = new Map(resources.map((r) => [r.path, r]));

export function resource(path: string): ResourceDef | undefined {
  return byPath.get(path);
}

export function field(def: ResourceDef, name: string): FieldDef | undefined {
  return def.fields.find((f) => f.name === name);
}

/** Resources that reference `path` through a ref field — used to build related tabs. */
export function relatedOf(path: string): { res: ResourceDef; field: FieldDef }[] {
  const out: { res: ResourceDef; field: FieldDef }[] = [];
  for (const r of resources) {
    for (const f of r.fields) {
      if (f.ref === path && !(r.path === path && f.name === "parentId" && false)) out.push({ res: r, field: f });
    }
  }
  return out;
}

/** Resources only administrators, managers and auditors may list (mirrors the server policy). */
export const RESTRICTED_RESOURCES = new Set(["audit-events", "delegations", "devices", "settings", "outbox-events", "integrations", "webhook-subscriptions", "users", "notifications"]);

export const GROUP_ORDER = [
  "Maintenance",
  "Assets",
  "Workforce",
  "Inventory",
  "Procurement",
  "Safety & Compliance",
  "Reliability",
  "Commercial",
  "Documents",
  "Administration",
];

export function resourcesOfModule(code: string): ResourceDef[] {
  return resources.filter((r) => r.module === code);
}

// ---------------------------------------------------------------- localisation (plan item H1)
import { FR_LABELS, FR_MODULES, FR_RESOURCES } from "./fr";

const original = {
  modules: Object.fromEntries(Object.entries(modules).map(([k, m]) => [k, m.title])),
  resources: Object.fromEntries(resources.map((r) => [r.path, { label: r.label, singular: r.singular, fields: r.fields.map((f) => f.label) }])),
};

/** Switches model labels between English (source) and French in place. */
export function applyModelLanguage(lang: string) {
  const fr = lang === "FR";
  for (const [k, m] of Object.entries(modules)) m.title = fr ? FR_MODULES[k] ?? original.modules[k] : original.modules[k];
  for (const r of resources) {
    const o = original.resources[r.path];
    const t = FR_RESOURCES[r.path];
    r.label = fr && t ? t[0] : o.label;
    r.singular = fr && t ? t[1] : o.singular;
    r.fields.forEach((f, i) => { f.label = fr ? FR_LABELS[o.fields[i]] ?? o.fields[i] : o.fields[i]; });
  }
}
