import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build time (no request to Google from visitors' browsers).
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" });
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "OPES Maintain", template: "%s · OPES Maintain" },
  description: "Enterprise maintenance management — assets, work orders, preventive maintenance, inventory, safety and reliability.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161b22" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a href="#main" className="sr-only">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
