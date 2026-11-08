"use client";
import { useParams, useRouter } from "next/navigation";
import { RecordForm } from "@/components/fields";
import { ErrorState, Loading, PageHeader, useData, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { modules, resource } from "@/lib/registry";

export default function EditPage() {
  const { resource: path, id } = useParams<{ resource: string; id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { canWrite } = useAuth();
  const def = resource(path);
  const { data, error, loading } = useData(() => api<Record<string, unknown>>(`/${path}/${id}`), [path, id]);
  if (!def) return <ErrorState error={{ status: 404, message: `Unknown module “${path}”` }} />;
  if (!canWrite(def.path) || def.readonly) return <ErrorState error={{ status: 403, message: `Your role cannot edit ${def.label.toLowerCase()}.` }} />;
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState error={error} />;
  const mod = modules[def.module];
  return (
    <>
      <PageHeader icon={def.icon} title={`Edit ${String(data._label)}`} subtitle="Changes are versioned; if someone else saved first you will be asked to reload."
        crumbs={[{ href: "/modules", label: mod.group }, { href: `/m/${def.path}`, label: def.label }, { href: `/m/${def.path}/${id}`, label: String(data._label) }, { label: "Edit" }]} />
      <div className="card">
        <RecordForm def={def} initial={data} onCancel={() => router.back()} onSaved={() => { toast("Changes saved"); router.replace(`/m/${def.path}/${id}`); }} />
      </div>
    </>
  );
}
