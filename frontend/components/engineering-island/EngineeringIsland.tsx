/**
 * Engineering Island 总入口（Island V3 · `docs/ISLAND_V3_SPEC.md`）。
 *
 * 定位：**当前工程状态的实时投影**。信息密度高、噪音低、默认不打扰。
 *
 * ## V3 与 V2 的区别（2026-10-21，规格 §1）
 *
 * V2 是「多项目总览」+ 两个原生窗口（触发把手 + 完整面板）；
 * V3 把两个窗口合并为**一个可折叠窗口**，形态由 `form` 表达：
 *
 *     collapsed  360×44   把手条：标题 + 项目数 + 图钉 + 「展开」
 *     expanded   520×420  完整面板：多项目总览（V2 的一号位不变）
 *
 * 本组件是**形态状态机**的落脚点（唯一持有 form/pinned 的地方）：
 * 1. 首帧形态从 URL `?form=` 解析（Python 建窗时下发，`resolveIslandForm`）；
 * 2. 挂载后立刻 `readIslandState()` 与 Python 对账——**Python 是事实来源**，
 *    URL 只是首帧提示（用户可能在上一会话改过形态）；
 * 3. 用户操作（点把手条 / Alt+I / Esc / 图钉）先乐观翻本地状态，
 *    Python 返回值到了再纠正。子组件（页眉 / 把手条）全是展示组件。
 *
 * ## 保留的两条既有决策
 *
 * 1. **Alt+I 显隐 Island 窗口**：主窗口与面板窗口都监听，走 `desktopBridge.toggleIsland()`。
 * 2. **`variant`**：`page`（网页 /island，套在 AppShell 里）与 `panel`（桌面独立窗口，
 *    无 AppShell）。网页版没有窗口形态可言，恒为 expanded。
 */

import { useCallback, useEffect, useState } from "react";
import {
  desktopBridge,
  isDesktop,
  readIslandState,
  type IslandForm,
  type IslandState,
} from "@/lib/desktopBridge";
import { optimisticForm, resolveIslandForm } from "@/features/engineering-island";
import { EngineeringIslandOverview } from "./EngineeringIslandOverview";

export function EngineeringIsland({ variant = "page" }: { variant?: "page" | "panel" }) {
  const isPanel = variant === "panel";

  // 首帧形态：URL ?form=（桌面窗口由 Python 下发）；网页版恒展开
  const [form, setForm] = useState<IslandForm>(() =>
    isPanel && typeof window !== "undefined"
      ? resolveIslandForm(window.location.search)
      : "expanded",
  );
  const [pinned, setPinned] = useState(false);

  const reconcile = useCallback((state: IslandState | null) => {
    if (!state) return;
    setForm(state.form);
    setPinned(state.pinned);
  }, []);

  // 对账：Python 是事实来源（挂载即读；之后每次操作的返回值也会走到这里）
  useEffect(() => {
    if (!isPanel || !isDesktop()) return;
    void readIslandState().then(reconcile);
  }, [isPanel, reconcile]);

  /** 点把手条 / Alt+I：pinned 下不乐观翻（Python 也会挡），否则翻转 + 对账 */
  const onToggle = useCallback(() => {
    setForm((f) => (pinned ? f : optimisticForm(f)));
    void desktopBridge.toggleIsland().then(reconcile);
  }, [pinned, reconcile]);

  /** Esc 收起：仅面板窗口（网页版按 Esc 收起一个网页面板没有意义，
   *  还会和"Esc 关闭弹窗"这类既有行为打架；pinned 时的拒绝由 Python 侧状态机兜底）。 */
  const onCollapse = useCallback(() => {
    setForm((f) => (pinned ? f : "collapsed"));
    void desktopBridge.collapseIsland().then(reconcile);
  }, [pinned, reconcile]);

  /** 图钉：pin 恒展开（Python 侧保证），unpin 不自动收起（规格 §2.3）。 */
  const onTogglePin = useCallback(() => {
    const willPin = !pinned;
    setPinned(willPin);
    if (willPin) setForm("expanded"); // pin → 展开，本地先翻，Python 返回值到了再纠正
    void (willPin ? desktopBridge.pinIsland() : desktopBridge.unpinIsland()).then(reconcile);
  }, [pinned, reconcile]);

  // 桌面版快捷键：Alt+I 唤出/收起 Island 窗口。
  // R-14 修复：**仅面板窗口**在此注册——主窗口（含 /island 页）由 AppShell 的
  // useIslandHotkey 全局注册，两处同挂会让桌面 /island 一次按键触发两次 toggle。
  // 面板窗口不套 AppShell（(panel)/layout.tsx），本地注册是它唯一的快捷键来源。
  useEffect(() => {
    if (!isDesktop() || !isPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPanel, onToggle]);

  useEffect(() => {
    if (!isPanel || !isDesktop()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCollapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPanel, onCollapse]);

  return (
    <EngineeringIslandOverview
      variant={variant}
      form={isPanel ? form : "expanded"}
      pinned={pinned}
      onActivate={onToggle}
      onTogglePin={onTogglePin}
    />
  );
}
