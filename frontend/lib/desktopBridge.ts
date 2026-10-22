/**
 * 桌面版（pywebview）桥接（Island V3 · 单窗两态，2026-10-21 起）。
 *
 * 浏览器里 `window.pywebview` 不存在，所以这里**必须永远可用**：
 * 任何一环拿不到桥，就退化成"桌面功能不可用"的 no-op，而不是抛错让页面白屏。
 *
 * 为什么不用 `window.addEventListener('pywebviewready')` 之外的复杂握手：
 * pywebview 会在 DOM 就绪后注入 `window.pywebview.api`，且注入发生在我们模块加载**之后**，
 * 所以每次调用都现取属性，而不是在模块顶层缓存一个可能为 undefined 的引用。
 */

/**
 * Island 窗口状态（Island V3 · `docs/ISLAND_V3_SPEC.md` §2 的两个状态）。
 * 字段与 desktop/window_manager.WindowManager.island_state() 一一对应。
 */
export interface IslandState {
  registered: boolean;
  /** auto_hide = 可收起（默认）；pinned = 固定保持展开 */
  displayMode: "auto_hide" | "pinned";
  /** collapsed = 360×44 把手条；expanded = 完整面板 */
  form: "collapsed" | "expanded";
  pinned: boolean;
  expanded: boolean;
}

/**
 * Island 窗口形态（Island V3）：collapsed = 360×44 把手条，expanded = 完整面板。
 * 与 Python 侧 desktop/config.py 的 FORMS 一一对应；从 IslandState 派生，单一事实来源。
 */
export type IslandForm = IslandState["form"];

export interface IslandWindowApi {
  toggle_island?: () => Promise<IslandState | void> | IslandState | void;
  expand_island?: () => Promise<IslandState | void> | IslandState | void;
  collapse_island?: () => Promise<IslandState | void> | IslandState | void;
  pin_island?: () => Promise<IslandState | void> | IslandState | void;
  unpin_island?: () => Promise<IslandState | void> | IslandState | void;
  island_state?: () => Promise<IslandState> | IslandState;
  /** M3：按位移增量移动窗口（单位 DIP） */
  move_window_by?: (dx: number, dy: number) => unknown;
  /** M3：按边缘缩放（edge 含 left/right/top/bottom 组合，仅展开态有效） */
  resize_window_by?: (edge: string, dx: number, dy: number) => unknown;
  /** M3：拖动/缩放结束 → 立即持久化位置与尺寸 */
  end_window_drag?: () => unknown;
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

/** 带参调用（pywebview 的 api 方法支持位置参数）。 */
function callWith(name: keyof IslandWindowApi, ...args: unknown[]): boolean {
  const fn = api()?.[name];
  if (typeof fn !== "function") return false;
  try {
    void (fn as (...a: unknown[]) => unknown)(...args);
    return true;
  } catch {
    return false;
  }
}

/**
 * 会返回状态的调用：拿 Promise 解析值做**乐观切换后的对账**
 * （Python 是事实来源，本地先翻形态，返回值到了再纠正）。
 * 浏览器里（无桥）解析为 null，调用方按"非桌面"处理。
 */
async function callState(
  name: "toggle_island" | "expand_island" | "collapse_island" | "pin_island" | "unpin_island",
): Promise<IslandState | null> {
  const fn = api()?.[name];
  if (typeof fn !== "function") return null;
  try {
    const state = await (fn as () => Promise<IslandState | void>)();
    return (state as IslandState | undefined) ?? null;
  } catch {
    return null;
  }
}

export const desktopBridge = {
  toggleIsland: () => callState("toggle_island"),
  expandIsland: () => callState("expand_island"),
  collapseIsland: () => callState("collapse_island"),
  pinIsland: () => callState("pin_island"),
  unpinIsland: () => callState("unpin_island"),
  moveWindowBy: (dx: number, dy: number) => callWith("move_window_by", dx, dy),
  resizeWindowBy: (edge: string, dx: number, dy: number) =>
    callWith("resize_window_by", edge, dx, dy),
  endWindowDrag: () => callWith("end_window_drag"),
};

/**
 * M3：窗口拖动（pointer capture + 节流桥接）。
 *
 * 为什么不用 Win32 HTCAPTION：按下时鼠标捕获在 WebView2 子窗口上，原生模态拖动
 * 循环收不到 mousemove（需额外释放子窗口捕获，易碎）。pointer capture 让事件
 * **始终**回到发起元素（哪怕指针出了窗口）；桥接发**位移增量**，Python 按窗口
 * 当前位置自算绝对坐标 —— 丢事件自愈。
 *
 * Island V3 起只有一个 Island 窗口，不再需要 target 参数（V2 的 panel/trigger 之分
 * 随把手窗口一起退役）。
 */
export function trackWindowMove(e: React.PointerEvent): void {
  let lastX = e.screenX;
  let lastY = e.screenY;
  let lastSent = 0;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => {
    const now = performance.now();
    if (now - lastSent < 33) return; // 节流 ~30fps
    lastSent = now;
    const dx = ev.screenX - lastX;
    const dy = ev.screenY - lastY;
    lastX = ev.screenX;
    lastY = ev.screenY;
    if (dx === 0 && dy === 0) return;
    desktopBridge.moveWindowBy(dx, dy);
  };
  const onUp = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    desktopBridge.endWindowDrag();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

/** M3：边缘缩放（edge 为 left/right/top/bottom 的组合，如 "topright"）。 */
export function trackWindowResize(edge: string, e: React.PointerEvent): void {
  let lastX = e.screenX;
  let lastY = e.screenY;
  let lastSent = 0;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => {
    const now = performance.now();
    if (now - lastSent < 33) return;
    lastSent = now;
    const dx = ev.screenX - lastX;
    const dy = ev.screenY - lastY;
    lastX = ev.screenX;
    lastY = ev.screenY;
    if (dx === 0 && dy === 0) return;
    desktopBridge.resizeWindowBy(edge, dx, dy);
  };
  const onUp = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    desktopBridge.endWindowDrag();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

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
