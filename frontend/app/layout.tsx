import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppearanceProvider } from "@/components/providers/AppearanceProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Plane · Blueprint Editorial",
  description:
    "A minimal project management tool — workspace, project, issue, comment, activity. Blueprint Editorial design language.",
};

/**
 * 首屏主题/缩放内联脚本：在任何绘制前按 localStorage 预设 <html data-theme> 与 --ui-zoom，
 * 避免暗色用户先闪一下浅色（FOUC）。逻辑与 stores/appearance 的 resolveTheme 保持一致。
 */
const APPEARANCE_SCRIPT = `(function(){try{var t=localStorage.getItem('mp-theme')||'system';var z=parseFloat(localStorage.getItem('mp-zoom'));var d=t==='dark'||(t==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';if(isFinite(z)&&z>=0.8&&z<=1.4)r.style.setProperty('--ui-zoom',String(z));}catch(e){}})();`;

/**
 * Fonts are loaded via CSS @import in globals.css using @fontsource packages,
 * because Google Fonts CDN is not reachable from the sandboxed build environment.
 * The CSS variables --font-serif / --font-sans / --font-mono are defined in globals.css.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <QueryProvider>{children}</QueryProvider>
        </AppearanceProvider>
        {/* Batch-operation results surface here (SCREEN_BLUEPRINTS §5.3). */}
        <Toaster />
      </body>
    </html>
  );
}
