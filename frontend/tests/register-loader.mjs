/**
 * Registers the `@/` alias resolver for `node --test`. See ./alias-loader.mjs.
 *
 * `node:module`'s `register()` is available since Node 20.6, so no dependency is
 * needed — the whole point of this test setup is staying dependency-free.
 */

import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
