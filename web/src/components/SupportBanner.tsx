"use client";
import { endSupportSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

/** Shown on every page during an OPES read-only support session. */
export function SupportBanner() {
  const { user } = useAuth();
  if (!user?.supportSession) return null;
  return (
    <div className="support-banner" role="status">
      <Icon name="LifeBuoy" size={16} />
      <span><b>OPES support session</b> — read-only access to {user.tenantName}. Opening this session was recorded in the company&apos;s audit trail and its administrators were notified.</span>
      <button type="button" className="btn btn-sm" onClick={() => { endSupportSession(); window.close(); window.location.replace("/platform"); }}>End session</button>
    </div>
  );
}
