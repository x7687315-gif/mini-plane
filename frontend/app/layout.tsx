import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Plane · Blueprint Editorial",
  description:
    "A minimal project management tool — workspace, project, issue, comment, activity. Blueprint Editorial design language.",
};

/**
 * Fonts are loaded via CSS @import in globals.css using @fontsource packages,
 * because Google Fonts CDN is not reachable from the sandboxed build environment.
 * The CSS variables --font-serif / --font-sans / --font-mono are defined in globals.css.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        {/* Batch-operation results surface here (SCREEN_BLUEPRINTS §5.3). */}
        <Toaster />
      </body>
    </html>
  );
}