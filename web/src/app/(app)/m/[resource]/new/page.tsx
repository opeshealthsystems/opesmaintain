"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RecordForm } from "@/components/fields";
import { ErrorState, Loading, PageHeader, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { modules, resource } from "@/lib/registry";

export default function NewPage() {
  const { resource: path } = useParams<{ resource: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { canWrite } = useAuth();
  const def = resource(path);
  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!def) return;
    const d: Record<string, unknown> = {};
    const pending: Promise<void>[] = [];
    for (const f of def.fields) {
      const v = sp.get(f.name);
      if (!v) continue;
      d[f.name] = v;
      if (f.type === "ref") pending.push(api<Record<string, unknown>>(`/${f.ref}/${v}`).then((r) => { d[`${f.name}Label`] = r._label; }).catch(() => {}));
    }
    Promise.all(pending).then(() => setDefaults(d));
  }, [def, sp]);

  if (!def) return <ErrorState error={{ status: 404, message: `Unknown module “${path}”` }} />;
  if (!canWrite(def.path) || def.readonly) return <ErrorState error={{ status: 403, message: `Your role cannot create ${def.label.toLowerCase()}.` }} />;
  if (!defaults) return <Loading />;
  const mod = modules[def.module];
  return (
    <>
      <PageHeader icon={def.icon} title={`New ${def.singular.toLowerCase()}`} subtitle={def.desc}
        crumbs={[{ href: "/modules", label: mod.group }, { href: `/m/${def.path}`, label: def.label }, { label: "New" }]} />
      <div className="card">
        <RecordForm def={def} defaults={defaults} onCancel={() => router.back()} onSaved={(r) => { toast(`${def.singular} created`); router.replace(`/m/${def.path}/${r.id}`); }} />
      </div>
    </>
  );
}
