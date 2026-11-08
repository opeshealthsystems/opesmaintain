"use client";
import { useParams } from "next/navigation";
import { ResourceList } from "@/components/ResourceList";
import { ErrorState } from "@/components/ui";
import { resource } from "@/lib/registry";

export default function ListPage() {
  const { resource: path } = useParams<{ resource: string }>();
  const def = resource(path);
  if (!def) return <ErrorState error={{ status: 404, message: `Unknown module “${path}”` }} />;
  return <ResourceList key={def.path} def={def} />;
}
