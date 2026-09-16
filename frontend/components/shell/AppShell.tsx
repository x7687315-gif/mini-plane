import type { ReactNode } from "react";
import clsx from "clsx";
import { TopBar } from "./TopBar";
import { LeftRail, type RailWorkspace } from "./LeftRail";
import { Aside } from "./Aside";
import { Footer } from "./Footer";

/**
 * AppShell — see SCREEN_BLUEPRINTS §1.
 *
 * The full authenticated layout: TopBar + LeftRail + Main + Aside + Footer.
 *
 * Layout: 56 / (96 + flex + 240) / 28 (px)
 *
 * Body inherits the global 32px blueprint grid (set on <body> in globals.css).
 */

export interface AppShellProps {
  children: ReactNode;
  topbar?: {
    workspace?: string;
    project?: string;
    role?: number;
    username?: string;
  };
  rail?: {
    workspaces?: RailWorkspace[];
    current?: string;
  };
  aside?: ReactNode;
  /** Hide the Aside (mobile / when there is no KPI to show). */
  hideAside?: boolean;
  /** Class for the main column (e.g. to remove padding on full-bleed layouts). */
  mainClassName?: string;
}

export function AppShell({
  children,
  topbar,
  rail,
  aside,
  hideAside = false,
  mainClassName,
}: AppShellProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TopBar {...topbar} />
      <div className="flex flex-1 min-h-0">
        <LeftRail {...(rail ?? {})} />
        <main className={clsx("flex-1 min-w-0 overflow-auto px-9 py-7", mainClassName)}>
          {children}
        </main>
        {!hideAside && <Aside>{aside}</Aside>}
      </div>
      <Footer />
    </div>
  );
}