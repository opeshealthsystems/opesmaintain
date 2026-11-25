"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { GROUP_ORDER, modules, resourcesOfModule } from "@/lib/registry";

const EXTRA: Record<string, { href: string; label: string }[]> = {
  M08: [{ href: "/work-board", label: "Work board" }],
  M09: [{ href: "/pm-board", label: "PM board" }],
  M10: [{ href: "/dispatch", label: "Dispatch calendar" }],
  M11: [{ href: "/technician", label: "Technician app" }],
  M15: [{ href: "/stock", label: "Stock control" }],
  M20: [{ href: "/portal", label: "Customer portal" }],
  M24: [{ href: "/analytics", label: "Analytics" }],
  M25: [{ href: "/reports", label: "Reports" }],
  M06: [{ href: "/settings", label: "Settings" }],
};

export default function ModulesPage() {
  const t = useT();
  const { canRead, canOpen } = useAuth();
  // Only what this role may open: pages it can see and modules it can read.
  const links = (code: string) => [
    ...(EXTRA[code] ?? []).filter((x) => x.href === "/settings" || canOpen(x.href)).map((x) => ({ href: x.href, label: x.label, icon: "ArrowRight" })),
    ...resourcesOfModule(code).filter((r) => canRead(r.path)).map((r) => ({ href: `/m/${r.path}`, label: r.label, icon: r.icon })),
  ];
  const groups = GROUP_ORDER.map((g) => ({ g, mods: Object.values(modules).filter((m) => m.group === g && links(m.code).length > 0) })).filter((x) => x.mods.length);
  return (
    <>
      <PageHeader icon="LayoutGrid" title={t("All modules")} subtitle={t("The modules available for your role, grouped by operational area.")} />
      <div className="stack">
        {groups.map(({ g, mods }) => (
          <section key={g} className="stack" style={{ gap: 10 }}>
            <h2>{t(g)}</h2>
            <div className="grid grid-3">
              {mods.map((m) => (
                <div key={m.code} className="card">
                  <div className="card-body stack" style={{ gap: 10 }}>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <div className="title-icon" style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flex: "0 0 auto" }}><Icon name={m.icon} /></div>
                      <div><div style={{ fontWeight: 600 }}>{m.title}</div><div className="small muted">{m.code}</div></div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {links(m.code).map((x) => <Link key={x.href} href={x.href} className="btn btn-sm"><Icon name={x.icon} size={13} />{x.label}</Link>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
