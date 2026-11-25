"use client";
import { useEffect } from "react";
import { startSupportSession } from "@/lib/api";

/** Opens a read-only support session in this tab only (token passed in the URL fragment, never sent to the server). */
export default function SupportEntry() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token) {
      startSupportSession(token);
      history.replaceState(null, "", "/support");
      window.location.replace("/dashboard");
    } else {
      window.location.replace("/login");
    }
  }, []);
  return <p style={{ padding: 32 }}>Opening support session…</p>;
}
