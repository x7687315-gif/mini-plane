/**
 * 「上次是谁」的记忆（Sprint 18 的本地化体验改进）。
 *
 * ## 为什么需要
 *
 * 这是本地单机软件：会话 cookie 跨启动保留（WebView2 profile 持久化），
 * 但**认证 store 是纯内存的**，重启后前端并不知道"这台机器上有个叫 XXX 的账户"。
 * 于是用户每次打开都要重新输一次昵称——明明已经登录过了。
 *
 * ## 为什么不加后端接口
 *
 * 不需要"记住我"这个动作本身：登录成功后我们就知道用户是谁，把它记下来即可。
 * 快速进入走的仍然是**原来那条登录路径**（`login({username})`），所以：
 * 免密账户 → 直接进；设过密码 → 落到密码步；账户被删 → 提示并清掉记忆。
 * 少一个接口 = 少一处将来要维护的契约。
 *
 * ## 只存"够用"的字段
 *
 * 只存 username 与 avatar（纯展示用）。**不存任何凭据**：
 * token 在 HttpOnly cookie 里，不进 localStorage。
 */

export interface LastUser {
  username: string;
  avatar: string | null;
}

const KEY = "mp-last-user";

/** 纯函数：把 localStorage 的原始字符串解析成可信结构（脏数据一律当作"没有"）。 */
export function parseLastUser(raw: string | null): LastUser | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { username, avatar } = parsed as Record<string, unknown>;
    if (typeof username !== "string" || username.trim() === "") return null;
    return {
      username: username.trim(),
      avatar: typeof avatar === "string" && avatar !== "" ? avatar : null,
    };
  } catch {
    // 存了半截 / 被别的代码写坏：当作没有，别让登录页崩
    return null;
  }
}

/**
 * 读「上次是谁」（SSR 安全）。
 *
 * 带**引用缓存**，这是为了配合 `useSyncExternalStore`：它的 getSnapshot 必须返回
 * 稳定的引用，否则 React 会认为快照一直在变而陷入无限重渲染。
 * 缓存以原始字符串为键——只要 localStorage 没动过，就返回同一个对象。
 */
let cacheRaw: string | null = null;
let cacheValue: LastUser | null = null;

export function readLastUser(): LastUser | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cacheRaw) return cacheValue;
  cacheRaw = raw;
  cacheValue = parseLastUser(raw);
  return cacheValue;
}

/** 写/清之后必须让缓存失效，否则读到旧值。 */
export function writeLastUser(user: { username: string; avatar?: string | null }): void {
  if (typeof window === "undefined") return;
  const payload: LastUser = {
    username: user.username.trim(),
    avatar: user.avatar ?? null,
  };
  if (payload.username === "") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* 隐私模式 / 配额禁用：只是没有快捷入口，不影响正常登录 */
  }
  cacheRaw = null;
  cacheValue = null;
}

export function clearLastUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
  cacheRaw = null;
  cacheValue = null;
}
