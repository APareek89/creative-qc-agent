import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { isDemoMode } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Framewise — Creative QC Agents",
  description: "Calibrate once. Generate, judge, and deliver autonomously.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell demoMode={isDemoMode}>{children}</AppShell>
      </body>
    </html>
  );
}
