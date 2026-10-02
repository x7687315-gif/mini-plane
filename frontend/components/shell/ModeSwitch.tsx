"use client";

/**
 * 模式切换按钮（Sprint 17）——个人 ⇄ 团队的唯一入口。
 *
 * ## 为什么放顶栏而不是侧栏
 *
 * 侧栏要同时显示"个人区 + 团队区"就得把两种导航混在一列里，而这两层的目标页
 * 完全不同（个人 = 跨项目聚合视图，团队 = 某个工作区的项目页），混排会让侧栏变成
 * 一份没人看得懂的清单。顶栏是"我在哪一层"的全局声明位置，一个按钮就够。
 *
 * ## 无障碍上的两个刻意选择
 *
 * 1. 用原生 `<button>`：Enter / Space 天然可触发，不自己绑 keydown。
 * 2. `aria-label` 写**动词短语**（「切换到团队协作」）而不是当前状态：
 *    读屏用户按下按钮前需要知道"会发生什么"，而不是"现在是什么"——
 *    当前状态已经由按钮上可见的「个人 / 团队」文字表达了。
 */

import { usePathname, useRouter } from "next/navigation";
import { SwitchIcon } from "@/components/icons";
import { routeToMode, switchTarget } from "@/stores/mode-logic";
import { useModeStore } from "@/stores/mode";

export function ModeSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  // 层由 URL 判定（唯一事实来源），刻意不用 chrome store——/workspaces 不传 railCurrent
  const mode = routeToMode(pathname);
  const toTeam = mode === "personal";
  const href = switchTarget(mode, useModeStore.getState().lastTeamPath);

  const remember = useModeStore((s) => s.setLastTeamPath);

  return (
    <button
      type="button"
      // 先写记忆再跳转：反过来的话组件会先卸载，写入可能丢失
      onClick={() => {
        if (toTeam) remember(href);
        router.push(href);
      }}
      aria-label={toTeam ? "切换到团队协作" : "切换到个人工程"}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[color:var(--color-rule)] text-[10px] uppercase tracking-[0.14em] font-sans font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] hover:border-[color:var(--color-ink-2)] transition-colors duration-[var(--duration-fast)]"
    >
      <SwitchIcon size={12} />
      <span>{toTeam ? "团队" : "个人"}</span>
    </button>
  );
}
