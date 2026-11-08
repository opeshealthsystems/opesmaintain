"use client";
import { useParams } from "next/navigation";
import { ResourceDetail } from "@/components/ResourceDetail";
import { ErrorState } from "@/components/ui";
import { resource } from "@/lib/registry";

export default function DetailPage() {
  const { resource: path, id } = useParams<{ resource: string; id: string }>();
  const def = resource(path);
  if (!def) return <ErrorState error={{ status: 404, message: `Unknown module “${path}”` }} />;
  return <ResourceDetail key={`${path}/${id}`} def={def} id={id} />;
}
