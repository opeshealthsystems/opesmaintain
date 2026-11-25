import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import "./onboarding.css";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
