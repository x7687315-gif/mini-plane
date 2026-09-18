"""Realtime 端到端冒烟：真 WebSocket 连接 + Session 鉴权 + 广播（Sprint 7）。

与自动化测试的区别：Channels 的 consumer 测试用 `WebsocketCommunicator` 在进程内直连，
本脚本走**真的 daphne + 真的 TCP + 真的 Session Cookie**，验证"浏览器里那套能不能收到"。

覆盖（对应 08 契约与前端 sprint-7 devlog 里标 ⚠️ 的项）：

1. 握手：连上后立即收到 `{"event":"connected","payload":{role: …}}`；
2. 心跳：客户端发 `{"type":"ping"}` → 服务端回 `{"event":"pong"}`；
3. `issue.updated`：A 用 HTTP 改状态 → B 在 WS 上收到同构 diff；
4. `comment.created`：B 发评论 → A 在 WS 上收到正文与作者；
5. 错误帧：发协议外消息 → 收到 error 帧且连接**不断**；
6. 关闭码 `4404`：非成员连该项目 → 被关闭且码为 4404；
7. 关闭码 `4401`：不带会话连 → 被关闭且码为 4401。

用法（另开一个终端先起服务）：

    python manage.py runserver 127.0.0.1:8000 --settings=config.settings.local
    python scripts/smoke_realtime.py [base_url]

依赖：`websockets`（本地开发脚本专用，不在 requirements 里）。
    pip install websockets

⚠️ `websockets` ≥15 默认会为 ws:// 读环境代理，本地直连不该经过代理，
    所以下面的连接统一传 `proxy=None`。

⚠️ 已知偏差（本脚本首次真跑就抓到了）：契约 08 说未登录 → `4401`、项目不可见 → `4404`，
    但 `apps/realtime/consumers.py` 的 `connect()` 是**先 close 再 accept**，
    而 daphne 对"未 accept 就 close"的处理是**拒绝握手并回 HTTP 403**，
    **关闭码到不了客户端**（浏览器侧只看到 1006）。脚本会把这种情况标成
    `[DIFF]` 而不是普通 FAIL —— 它指出的是契约与实现不一致，不是脚本写错了。

脚本复用固定冒烟账号（不存在则注册、已存在则登录），末尾删除自己创建的工作区
（级联清理），因此可以反复运行而不累积数据。
"""

import hashlib
import http.cookiejar
import itertools
import json
import sys
import urllib.error
import urllib.request

from websockets.exceptions import ConnectionClosed, InvalidStatus
from websockets.sync.client import connect as _ws_connect

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8000"
WS_BASE = BASE.replace("https://", "wss://").replace("http://", "ws://")

FAILURES = []
#: 契约与实现的偏差（不是纯粹的失败，但必须被看见）
DIFFERENCES: list[str] = []
_counter = itertools.count(1)

# 与 smoke_backend.py 同样的思路：不把凭据写死在源码里，由常量派生（跨运行确定）
_EPOCH = hashlib.sha256(b"miniplane-realtime-smoke/v1").hexdigest()[:8]
PASSWORD = "Pw!" + hashlib.sha256(b"miniplane-realtime-password/v1").hexdigest()[:14]
OWNER = f"rt_owner_{_EPOCH}"
MEMBER = f"rt_member_{_EPOCH}"
OUTSIDER = f"rt_outsider_{_EPOCH}"

# 页面来源：后端在生产下面会校验 Origin（本地 DEBUG 一般全放行，这里带上更接近真实浏览器）
ORIGIN = "http://localhost:3000"


def step(text: str) -> str:
    return f"{next(_counter):02d}. {text}"


class HandshakeRejected(Exception):
    """服务端**拒绝握手**（HTTP 403），而不是接受后用关闭码结束。

    这个区分很重要：Channels 里 `close()` 若发生在 `accept()` **之前**，
    daphne 会直接回 `HTTP/1.1 403 Access denied` 拒绝升级，
    **自定义关闭码（4401/4404）根本到不了客户端** —— 浏览器侧只会看到
    1006（异常关闭）。契约 08 描述的是关闭码，所以这条路径属于契约与实现的偏差。
    """


def connect_ws(uri: str, **kwargs):
    """连本地 WebSocket。

    `proxy=None`：`websockets` ≥15 默认会为 ws:// 读环境代理，本地直连不该经过代理。
    403 时抛 `HandshakeRejected`（而不是让它冒成晦涩的 InvalidStatus），
    由调用方按"握手被拒"处理。
    """
    kwargs.setdefault("proxy", None)
    try:
        return _ws_connect(uri, **kwargs)
    except InvalidStatus as exc:
        if getattr(exc.response, "status_code", None) == 403:
            raise HandshakeRejected(
                "服务端拒绝了 WebSocket 握手（HTTP 403 Access denied）"
            ) from exc
        raise


def report_close_behavior(label: str, handshake_rejected: bool, closed_code, expected: int) -> None:
    """如实报告"拒绝"发生在哪一层。

    契约 08 说的是**关闭码**（accept 之后 close），实现是**握手拒绝**（accept 之前 close）
    → daphne 回 403，客户端拿到的是 1006。把这件事单独标出来，
    比"FAIL 4404"更有信息量：它指出的是契约与实现的偏差，而不仅是断言失败。
    """
    if handshake_rejected:
        print(
            f"[DIFF] {label}: 服务端**拒绝握手**（HTTP 403）——\n"
            f"        契约期望的是 accept 后用关闭码 {expected} 结束。\n"
            f"        浏览器侧只会看到 1006（异常关闭），拿不到 {expected}。\n"
            f"        见 apps/realtime/consumers.py：connect() 里 close() 发生在 accept() 之前。"
        )
        DIFFERENCES.append(label)
        return
    check(label, closed_code, expected)


def _close_code(exc) -> int | None:
    """从 ConnectionClosed 里取关闭码 —— 各版本暴露位置不同，逐个试。"""
    for attr in ("rcvd", "sent"):
        frame = getattr(exc, attr, None)
        if frame is not None and getattr(frame, "code", None) is not None:
            return frame.code
    return getattr(exc, "code", None)


def check(label: str, got, want) -> None:
    ok = got == want
    print(f"[{'ok ' if ok else 'FAIL'}] {label}: {got!r}" + ("" if ok else f"  (期望 {want!r})"))
    if not ok:
        FAILURES.append(label)


def ok(label: str, condition: bool, detail: str = "") -> None:
    print(f"[{'ok ' if condition else 'FAIL'}] {label}" + (f": {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)


class Client:
    """一个带 cookie jar + CSRF 的 HTTP 客户端（一个用户一个）。"""

    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def cookie_header(self) -> str:
        return "; ".join(f"{c.name}={c.value}" for c in self.jar)

    def request(self, method: str, path: str, body=None):
        url = f"{BASE}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        req.add_header("Origin", ORIGIN)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if method not in ("GET", "HEAD"):
            token = next((c.value for c in self.jar if c.name == "csrftoken"), "")
            req.add_header("X-CSRFToken", token)
            req.add_header("Referer", ORIGIN + "/")
        try:
            with self.opener.open(req) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw.decode(errors="replace")[:200]
            return e.code, parsed

    def login(self, username: str) -> int:
        self.request("GET", "/api/v1/auth/csrf/")
        status, _ = self.request(
            "POST",
            "/api/v1/auth/register/",
            {"username": username, "email": f"{username}@example.com", "password": PASSWORD},
        )
        if status != 201:
            status, _ = self.request(
                "POST", "/api/v1/auth/login/", {"username": username, "password": PASSWORD}
            )
        return status


def recv_json(ws, timeout=10):
    raw = ws.recv(timeout=timeout)
    return json.loads(raw)


def main() -> int:
    owner, member, outsider = Client(), Client(), Client()

    print("── 准备数据 ──────────────────────────────────────────")
    # 首跑 201 注册、重跑 200 登录 —— 脚本要能反复跑（与 smoke_backend.py 同一约定）
    # 首跑 201 注册、重跑 200 登录 —— 用 ok() 表达"二者之一"（check 是严格相等）
    _status = owner.login(OWNER)
    ok(
        step("冒烟账号 owner（首跑 201 注册 / 重跑 200 登录）"),
        _status in (200, 201),
        f"status={_status}",
    )
    # 首跑 201 注册、重跑 200 登录 —— 脚本要能反复跑（与 smoke_backend.py 同一约定）
    # 首跑 201 注册、重跑 200 登录 —— 用 ok() 表达"二者之一"（check 是严格相等）
    _status = member.login(MEMBER)
    ok(
        step("冒烟账号 member（首跑 201 注册 / 重跑 200 登录）"),
        _status in (200, 201),
        f"status={_status}",
    )
    # 首跑 201 注册、重跑 200 登录 —— 脚本要能反复跑（与 smoke_backend.py 同一约定）
    # 首跑 201 注册、重跑 200 登录 —— 用 ok() 表达"二者之一"（check 是严格相等）
    _status = outsider.login(OUTSIDER)
    ok(
        step("冒烟账号 outsider（首跑 201 注册 / 重跑 200 登录）"),
        _status in (200, 201),
        f"status={_status}",
    )

    status, ws_ = owner.request(
        "POST", "/api/v1/workspaces/", {"name": "RT Smoke", "slug": f"rt-smoke-{_EPOCH}"}
    )
    check(step("创建工作区"), status, 201)
    slug = ws_["slug"]

    status, project = owner.request(
        "POST", f"/api/v1/workspaces/{slug}/projects/", {"name": "RT", "identifier": "RT"}
    )
    check(step("创建项目"), status, 201)
    pid = project["id"]

    _, mid = member.request("GET", "/api/v1/auth/me/")
    status, _ = owner.request(
        "POST",
        f"/api/v1/workspaces/{slug}/members/",
        {"email": f"{MEMBER}@example.com", "role": 15},
    )
    check(step("member 加入工作区"), status, 201)
    status, _ = owner.request(
        "POST",
        f"/api/v1/workspaces/{slug}/projects/{pid}/members/",
        {"user_id": mid["id"], "role": 15},
    )
    check(step("member 加入项目"), status, 201)

    status, issue = owner.request(
        "POST", f"/api/v1/workspaces/{slug}/projects/{pid}/issues/", {"title": "实时验证任务"}
    )
    check(step("创建 Issue"), status, 201)
    iid = issue["id"]

    ws_url = f"{WS_BASE}/ws/workspaces/{slug}/projects/{pid}/"

    # ── 1/2 握手与心跳 ────────────────────────────────────
    print("\n── 握手与心跳 ────────────────────────────────────────")
    with connect_ws(
        ws_url, additional_headers={"Origin": ORIGIN, "Cookie": member.cookie_header()}
    ) as conn:
        hello = recv_json(conn)
        check(step("握手确认帧 event"), hello.get("event"), "connected")
        check(step("握手帧带 project_id"), hello["payload"].get("project_id"), pid)
        check(step("握手帧带生效角色（member=15）"), hello["payload"].get("role"), 15)

        conn.send(json.dumps({"type": "ping"}))
        pong = recv_json(conn)
        check(step("心跳 ping → pong"), pong.get("event"), "pong")

        # ── 5 错误帧不断连接 ──────────────────────────────
        conn.send(json.dumps({"type": "nonsense"}))
        err = recv_json(conn)
        check(step("协议外消息 → error 帧"), err.get("event"), "error")
        ok(
            step("错误帧后连接仍可用（不发 ping 也能收广播）"),
            conn.close_code is None,
            f"close_code={conn.close_code}",
        )

        # ── 3 issue.updated：A 改 → B 收 ──────────────────
        print("\n── issue.updated 广播 ───────────────────────────────")
        _, states = owner.request("GET", f"/api/v1/workspaces/{slug}/projects/{pid}/states/")
        done = next(s for s in states["results"] if s["name"] == "Done")
        status, _ = owner.request(
            "PATCH",
            f"/api/v1/workspaces/{slug}/projects/{pid}/issues/{iid}/",
            {"state_id": done["id"]},
        )
        check(step("owner 用 HTTP 改状态"), status, 200)

        frame = recv_json(conn)
        check(step("member 在 WS 上收到事件"), frame.get("event"), "issue.updated")
        check(step("载荷含 issue_id"), frame["payload"].get("issue_id"), iid)
        check(
            step("载荷是展示用 diff（不含 UUID）"),
            frame["payload"].get("new_value"),
            {"state": "Done"},
        )

        # ── 4 comment.created：B 发 → A 收 ────────────────
        print("\n── comment.created 广播 ─────────────────────────────")
        with connect_ws(
            ws_url,
            additional_headers={"Origin": ORIGIN, "Cookie": owner.cookie_header()},
            proxy=None,
        ) as owner_conn:
            recv_json(owner_conn)  # 握手
            status, _ = member.request(
                "POST",
                f"/api/v1/workspaces/{slug}/projects/{pid}/issues/{iid}/comments/",
                {"content": "看到推送了吗"},
            )
            check(step("member 用 HTTP 发评论"), status, 201)

            frame = recv_json(owner_conn)
            check(step("owner 在 WS 上收到事件"), frame.get("event"), "comment.created")
            check(
                step("载荷带正文（无需回查接口）"), frame["payload"].get("content"), "看到推送了吗"
            )
            check(
                step("载荷带作者摘要"),
                frame["payload"]["author"].get("username"),
                MEMBER.username if hasattr(MEMBER, "username") else MEMBER,
            )

    # ── 6 4404：非成员 ────────────────────────────────────
    print("\n── 关闭码 ────────────────────────────────────────────")
    closed_code = None
    handshake_rejected = False
    try:
        with connect_ws(
            ws_url, additional_headers={"Origin": ORIGIN, "Cookie": outsider.cookie_header()}
        ) as conn:
            recv_json(conn)
    except HandshakeRejected:
        handshake_rejected = True
    except ConnectionClosed as e:
        closed_code = _close_code(e)
    report_close_behavior(
        step("非成员连项目（契约：关闭码 4404）"), handshake_rejected, closed_code, 4404
    )

    # ── 7 4401：无会话 ────────────────────────────────────
    closed_code = None
    handshake_rejected = False
    try:
        with connect_ws(ws_url, additional_headers={"Origin": ORIGIN}) as conn:
            recv_json(conn)
    except HandshakeRejected:
        handshake_rejected = True
    except ConnectionClosed as e:
        closed_code = _close_code(e)
    report_close_behavior(
        step("无会话连项目（契约：关闭码 4401）"), handshake_rejected, closed_code, 4401
    )

    # ── 清理 ──────────────────────────────────────────────
    print("\n── 清理 ──────────────────────────────────────────────")
    check(
        step("删除工作区（级联）"), owner.request("DELETE", f"/api/v1/workspaces/{slug}/")[0], 204
    )

    print()
    if DIFFERENCES:
        print(f"⚠️  契约与实现的偏差 {len(DIFFERENCES)} 项：" + "、".join(DIFFERENCES))
        print("    （这不是脚本的问题，是 08 契约与 consumer 实现不一致，需产品决策）")
    if FAILURES:
        print(f"❌ 实时冒烟失败 {len(FAILURES)} 项：" + "、".join(FAILURES))
        return 1
    if DIFFERENCES:
        return 2
    print("✅ 实时冒烟全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
