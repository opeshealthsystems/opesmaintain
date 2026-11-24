import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import "./public.css";

export const metadata: Metadata = {
  title: { absolute: "OPES Maintain — Maintenance management software for assets, work orders and preventive maintenance" },
  description:
    "Register your equipment, plan preventive maintenance, run work orders and prove compliance. For hospitals, factories, facilities and maintenance contractors. Free 30-day trial.",
  openGraph: {
    title: "OPES Maintain — Maintenance management software",
    description: "Every asset, every work order, every inspection — in one place. Free 30-day trial.",
    type: "website",
  },
};

export default function Home() {
  return <Landing />;
}
