import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` is what makes the production image small: Next traces every module
   * the server actually imports and emits a self-contained `.next/standalone` folder
   * with only those files. Without it the runner stage would copy the whole
   * `node_modules` (hundreds of MB) plus every build-time dependency.
   *
   * Consequence worth knowing: the container's entrypoint becomes `server.js`, not
   * `next start` — see frontend/Dockerfile.
   */
  output: "standalone",

  /**
   * Fail the build on type errors instead of shipping them.
   *
   * Next already defaults to failing on type errors; stating it explicitly so a future
   * `ignoreBuildErrors: true` cannot be slipped in unnoticed — the contract-driven
   * types are the main safety net this project has (see the devlogs' "四绿" sections).
   *
   * NOTE: Next 16 removed the `eslint` key from `NextConfig` (and `next build` no
   * longer runs ESLint at all). Linting is therefore a **separate, mandatory** gate:
   * the `ESLint` step in .github/workflows/ci.yml and `pnpm lint` locally. It is not
   * redundant — it is the only place lint runs in CI.
   */
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
