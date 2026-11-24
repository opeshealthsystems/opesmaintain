import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupFlow } from "@/components/SignupFlow";
import "../public.css";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create your OPES Maintain workspace — free 30-day trial, no card required.",
};

export default function SignupPage() {
  return <Suspense><SignupFlow /></Suspense>;
}
