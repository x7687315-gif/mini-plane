/**
 * 模式判定的纯逻辑（Sprint 17）。
 *
 * 单独成文件而不是塞进 `stores/mode.ts`，是因为那边带 `"use client"` + zustand，
 * `node --test` 加载不了；而这两个函数恰恰是"算错了但界面看起来还挺正常"的地方。
 *
 * **最核心的一条**：判"当前在哪一层"只看 URL，绝不看 store。
 * 曾经考虑用 `useChrome` 的 `railCurrent`，但 `/workspaces` 那一页**不传 railCurrent**
 * （它不属于任何工作区），于是它和 `/me` 会得到同样的答案——而它们分属两层。
 * 那种情况下切换按钮会变成"死按钮"：判成个人层 → 显示「去团队」→ 点了还在 /workspaces。
 * URL 是唯一事实来源，判层就只该看 URL。
 */

export type Mode = "personal" | "team";

/** 每一层的"家"。个人层只有一个聚合首页；团队层的家是工作区列表。 */
export const HOME: Record<Mode, string> = {
  personal: "/",
  team: "/workspaces",
};

/** URL → 层。团队层 = `/workspaces` 或 `/w/` 之下，其余都是个人层。 */
export function routeToMode(pathname: string): Mode {
  // 精确相等 + 带斜杠前缀：写成 `startsWith("/w")` 会把 `/widget` 误判成团队层
  return pathname === HOME.team || pathname.startsWith("/w/") ? "team" : "personal";
}

/**
 * 切换按钮的目标落点。
 *
 * - 团队 → 个人：**永远回 `/`**，刻意不记"上次个人路径"。个人层就一个聚合首页；
 *   记 `/me/issues` 或 `/island` 会让用户从团队切回来时莫名其妙停在那，
 *   而这两处都有自己的入口（头像菜单 / Island 按钮），不需要模式切换器兜底。
 * - 个人 → 团队：优先回到上次停留的团队位置，没有记忆才去工作区列表。
 *   记忆必须以 `/w/` 开头才算数——脏值（空串、`/`、个人页路径）一律忽略。
 */
export function switchTarget(mode: Mode, lastTeamPath: string | null): string {
  if (mode === "team") return HOME.personal;
  if (typeof lastTeamPath === "string" && lastTeamPath.startsWith("/w/")) return lastTeamPath;
  return HOME.team;
}
