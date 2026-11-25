import type { FieldDef } from "./registry";

import { FR_VALUES } from "./fr";

let lang = "EN";

export function humanize(v: string): string {
  if (!v) return "";
  if (lang === "FR" && FR_VALUES[v]) return FR_VALUES[v];
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let currency = "XAF";
let locale = "en-GB";
export function setLocaleSettings(c: string, language: string) {
  currency = c || "XAF";
  lang = language === "FR" ? "FR" : "EN";
  locale = lang === "FR" ? "fr-FR" : "en-GB";
}
export function currentLocale() {
  return locale;
}

export function money(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currency === "XAF" ? 0 : 2 }).format(n);
  } catch {
    return n.toLocaleString(locale);
  }
}

export function num(v: unknown, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(locale, { maximumFractionDigits: digits });
}

export function date(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit" });
}

export function dateTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(locale, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function relative(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v)).getTime();
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatValue(f: FieldDef, row: Record<string, unknown>): string {
  const v = row[f.name];
  if (v === null || v === undefined || v === "") return "—";
  switch (f.type) {
    case "ref":
      return String(row[`${f.name}Label`] ?? "—");
    case "enum":
      return humanize(String(v));
    case "bool":
      return v ? (lang === "FR" ? "Oui" : "Yes") : lang === "FR" ? "Non" : "No";
    case "money":
      return money(v);
    case "dec":
      return num(v, 2);
    case "int":
      return num(v, 0);
    case "date":
      return date(v);
    case "datetime":
      return dateTime(v);
    default:
      return String(v);
  }
}

/** Converts an ISO instant to the value expected by <input type="datetime-local"> in local time. */
export function toLocalInput(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "local time";
  }
};
