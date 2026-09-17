/**
 * Test-only module resolver: lets the zero-dependency `node --test` runner load
 * source modules that use the `@/…` tsconfig path alias.
 *
 * Why this exists (see frontend/docs/devlog/sprint-5-frontend.md §3.1):
 * Node's native TypeScript support (type stripping) resolves *relative* specifiers
 * only. `lib/url.ts` imports `PRIORITY_VALUES` from `@/types/issue` at runtime, so
 * without this hook it is unloadable by `node --test` — which left the whole URL
 * parsing side of the filter engine untested.
 *
 * The hook only rewrites `@/x` into `<frontend>/x` and tries the extensions Node's
 * ESM loader needs. It never rewrites anything else, and it is loaded exclusively by
 * the `test` script, so it cannot affect the app bundle.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repo-relative root: this file lives in `frontend/tests/`. */
const ROOT = new URL("../", import.meta.url);

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = new URL(specifier.slice(2), ROOT);
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }

  // Fall through so the failure message still points at the original specifier.
  return nextResolve(specifier, context);
}
