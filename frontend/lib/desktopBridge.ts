/**
 * 桌面版（pywebview）桥接（Sprint 15 · Desktop Island）。
 *
 * 浏览器里 `window.pywebview` 不存在，所以这里**必须永远可用**：
 * 任何一环拿不到桥，就退化成"桌面功能不可用"的 no-op，而不是抛错让页面白屏。
 *
 * 为什么不用 `window.addEventListener('pywebviewready')` 之外的复杂握手：
 * pywebview 会在 DOM 就绪后注入 `window.pywebview.api`，且注入发生在我们模块加载**之后**，
 * 所以每次调用都现取属性，而不是在模块顶层缓存一个可能为 undefined 的引用。
 */

/**
 * Island 窗口状态（Island V2 阶段 2 · 规格 §2.3 的两个正交状态）。
 * 字段与 desktop/window_manager.WindowManager.island_state() 一一对应。
 */
export interface IslandState {
  registered: boolean;
  trigger: boolean;
  /** auto_hide = 隐藏式（默认）；pinned = 图钉固定 */
  displayMode: "auto_hide" | "pinned";
  /** hidden = 只显示把手；expanded = 完整面板可见 */
  visibility: "hidden" | "expanded";
  pinned: boolean;
  visible: boolean;
}

export interface IslandWindowApi {
  toggle_island?: () => IslandState | void;
  show_island?: () => IslandState | void;
  hide_island?: () => IslandState | void;
  pin_island?: () => IslandState | void;
  unpin_island?: () => IslandState | void;
  island_state?: () => IslandState;
}

interface PywebviewWindow {
  pywebview?: { api?: IslandWindowApi };
}

function api(): IslandWindowApi | null {
  if (typeof window === "undefined") return null;
  const pw = (window as unknown as PywebviewWindow).pywebview;
  return pw?.api ?? null;
}

/** 是否运行在桌面 App 里（浏览器里恒为 false，用于隐藏桌面专属控件）。 */
export const isDesktop = (): boolean => api() !== null;

function call(name: keyof IslandWindowApi): boolean {
  const fn = api()?.[name];
  if (typeof fn !== "function") return false;
  try {
    // pywebview 的 api 方法返回 Promise；这里故意不 await —— 触发即可，
    // 失败不该影响界面（真正的状态变化由另一个窗口的 storage 事件回传）。
    void fn();
    return true;
  } catch {
    return false;
  }
}

export const desktopBridge = {
  toggleIsland: () => call("toggle_island"),
  showIsland: () => call("show_island"),
  hideIsland: () => call("hide_island"),
  pinIsland: () => call("pin_island"),
  unpinIsland: () => call("unpin_island"),
};

/**
 * 读取 Island 当前状态（异步：pywebview 的 api 方法返回 Promise）。
 * 浏览器里（无桥）返回 null，调用方按"非桌面"处理。
 */
export async function readIslandState(): Promise<IslandState | null> {
  const fn = api()?.island_state;
  if (typeof fn !== "function") return null;
  try {
    const state = await fn();
    return state ?? null;
  } catch {
    return null;
  }
}

/** Island 窗口之间共享"当前图纸"的 storage key（两个 WebView2 窗口同源同 profile）。 */
export const ISLAND_SHEET_KEY = "mp-island-sheet";

export function readIslandSheet(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ISLAND_SHEET_KEY);
}

export function writeIslandSheet(projectId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (projectId) window.localStorage.setItem(ISLAND_SHEET_KEY, projectId);
    else window.localStorage.removeItem(ISLAND_SHEET_KEY);
  } catch {
    /* 隐私模式下 localStorage 可能不可写：忽略即可，Island 会退回各自独立选择 */
  }
}
