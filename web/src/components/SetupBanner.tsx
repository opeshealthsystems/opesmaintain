"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

/** Reminds administrators and managers to finish setting up their workspace. */
export function SetupBanner() {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const allowed = user?.role === "ADMIN" || user?.role === "MANAGER";
  useEffect(() => {
    if (!allowed) return;
    api<{ completed: boolean }>("/onboarding").then((s) => setPending(!s.completed)).catch(() => setPending(false));
  }, [allowed]);
  if (!pending) return null;
  const fr = user?.language === "FR";
  return (
    <div className="alert tone-info setup-banner" role="status">
      <Icon name="Sparkles" size={18} style={{ flex: "0 0 auto", marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <b>{fr ? "Terminez la configuration de votre espace" : "Finish setting up your workspace"}</b>
        <div>{fr ? "Choisissez vos sites et vos types d'équipements : plans de maintenance, check-lists, codes de défaillance et pièces sont préparés pour vous."
          : "Choose your sites and equipment types — maintenance plans, checklists, failure codes and spare parts are prepared for you."}</div>
      </div>
      <Link href="/onboarding" className="btn btn-primary btn-sm">{fr ? "Continuer" : "Continue setup"}</Link>
    </div>
  );
}

/** After sign-in: where an administrator or manager should land (the wizard while set-up is unfinished). */
export async function landingFor(role: string, fallback: string, platformOperator = false): Promise<string> {
  if (platformOperator) return "/platform";
  if (role !== "ADMIN" && role !== "MANAGER") return fallback;
  try {
    const s = await api<{ completed: boolean }>("/onboarding");
    return s.completed ? fallback : "/onboarding";
  } catch {
    return fallback;
  }
}
