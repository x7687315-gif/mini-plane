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

import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repo-relative root: this file lives in `frontend/tests/`. */
const ROOT = new URL("../", import.meta.url);

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  // 同时支持 `@/x` 与相对扩展名省略（Node 原生 TS 只解析显式扩展名）。
  // 应用代码按 Next/TS 习惯写 `./layout`，测试运行时需要在这里补齐。
  let base;
  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), ROOT);
  } else if (specifier.startsWith(".") && context.parentURL) {
    base = new URL(specifier, context.parentURL);
  } else {
    return nextResolve(specifier, context);
  }
  for (const ext of EXTENSIONS) {
    const candidate = new URL(base.href + ext);
    try {
      // 只接受文件：`@/features/anatomy` 同时存在同名目录与 index.ts，
      // 直接 existsSync 会把目录交给 Node，触发 EISDIR。
      if (statSync(fileURLToPath(candidate)).isFile()) {
        return { url: candidate.href, shortCircuit: true };
      }
    } catch {
      // 继续尝试下一个扩展名
    }
  }

  // Fall through so the failure message still points at the original specifier.
  return nextResolve(specifier, context);
}
