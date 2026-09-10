"""Sprint 3 端到端冒烟：真 HTTP + Session + CSRF，覆盖 Issue / Label 主链路。

与自动化测试的区别：测试用 `force_authenticate` 绕过认证，本脚本走真实
Cookie / CSRF / 会话中间件与序列化全链路，用来验证"前端同学能照着跑通"。

脚本会复用固定的两个冒烟账号（不存在则注册、已存在则登录），并在末尾删除
自己创建的工作区（级联清理），因此**可以反复运行而不累积数据**。

用法（另开一个终端先起服务）：

    python manage.py runserver 127.0.0.1:8000 --settings=config.settings.local
    python scripts/smoke_sprint3_issue.py [base_url]
"""

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from uuid import uuid4

FAILURES = []

SMOKE_PASSWORD = "Pw12345678"
OWNER_USERNAME = "smoke_issue_owner"
OUTSIDER_USERNAME = "smoke_issue_outsider"


def check(label: str, actual, expected) -> None:
    ok = actual == expected
    print(f"[{'ok ' if ok else 'FAIL'}] {label}: {actual!r}")
    if not ok:
        FAILURES.append(f"{label}: expected {expected!r}, got {actual!r}")


def check_in(label: str, actual, expected_any) -> None:
    ok = actual in expected_any
    print(f"[{'ok ' if ok else 'FAIL'}] {label}: {actual!r}")
    if not ok:
        FAILURES.append(f"{label}: expected one of {expected_any!r}, got {actual!r}")


def body_of(response, *keys):
    for key in keys:
        response = response[key]
    return response


class Client:
    """独立会话的 HTTP 客户端（各自一份 cookie jar）。"""

    def __init__(self, base: str):
        self.base = base
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.jar = jar

    def request(self, method: str, path: str, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if method in {"POST", "PATCH", "DELETE"}:
            req.add_header("X-CSRFToken", self.csrf_token())
            req.add_header("Referer", self.base + "/")
        try:
            with self.opener.open(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                return exc.code, (json.loads(raw) if raw else None)
            except json.JSONDecodeError:
                return exc.code, raw

    def csrf_token(self) -> str:
        return next((c.value for c in self.jar if c.name == "csrftoken"), "")


def ensure_session(client: Client, username: str) -> int:
    """注册（首次）或登录（后续重跑）；返回状态码供断言。"""
    status, _ = client.request(
        "POST",
        "/api/v1/auth/register/",
        {"username": username, "email": f"{username}@example.com", "password": SMOKE_PASSWORD},
    )
    if status == 201:
        return status
    return client.request(
        "POST", "/api/v1/auth/login/", {"username": username, "password": SMOKE_PASSWORD}
    )[0]


def main(base: str) -> int:
    stage = uuid4().hex[:8]
    a = Client(base)
    b = Client(base)

    check("1. GET /auth/csrf/", a.request("GET", "/api/v1/auth/csrf/")[0], 200)

    check_in(
        "2. 冒烟账号 A（首跑 201 注册 / 重跑 200 登录）",
        ensure_session(a, OWNER_USERNAME),
        (200, 201),
    )

    slug = f"smoke-{stage}"
    status, workspace = a.request("POST", "/api/v1/workspaces/", {"name": "Smoke WS", "slug": slug})
    check("3. 创建工作区", status, 201)

    ws_root = f"/api/v1/workspaces/{slug}"
    status, projects = a.request(
        "POST", f"{ws_root}/projects/", {"name": "Smoke Project", "identifier": "SMK"}
    )
    check("4. 创建项目", status, 201)
    project_id = body_of(projects, "id")
    project_root = f"{ws_root}/projects/{project_id}"

    status, states = a.request("GET", f"{project_root}/states/")
    check("5. 预置五态", (status, states["count"]), (200, 5))
    done_state = next(item for item in states["results"] if item["name"] == "Done")

    status, label = a.request(
        "POST", f"{project_root}/labels/", {"name": "bug", "color": "#ef4444"}
    )
    check("6. 创建标签", status, 201)

    status, issue1 = a.request("POST", f"{project_root}/issues/", {"title": "登录页验证码不显示"})
    check(
        "7. 创建 Issue #1（默认 Backlog）",
        (status, issue1["sequence_id"], issue1["state"]["name"]),
        (201, 1, "Backlog"),
    )

    status, issue2 = a.request(
        "POST",
        f"{project_root}/issues/",
        {"title": "second issue", "priority": "urgent", "label_ids": [body_of(label, "id")]},
    )
    check(
        "8. 创建 Issue #2（优先级+标签）",
        (status, issue2["sequence_id"], issue2["priority"], len(issue2["labels"])),
        (201, 2, "urgent", 1),
    )

    status, listing = a.request("GET", f"{project_root}/issues/")
    check(
        "9. 列表默认倒序",
        (listing["count"], [i["sequence_id"] for i in listing["results"]]),
        (2, [2, 1]),
    )

    status, listing = a.request("GET", f"{project_root}/issues/?ordering=sequence_id")
    check("10. ordering 升序", [i["sequence_id"] for i in listing["results"]], [1, 2])

    status, error = a.request("GET", f"{project_root}/issues/?ordering=title")
    check("11. 非法 ordering → 400", (status, error["ordering"]), (400, ["不支持的排序字段：title。"]))

    status, patched = a.request(
        "PATCH", f"{project_root}/issues/{issue1['id']}/", {"state_id": done_state["id"]}
    )
    check("12. PATCH 改状态", (status, patched["state"]["name"]), (200, "Done"))

    status, error = a.request(
        "POST",
        f"{project_root}/issues/",
        {"title": "bad", "assignee_id": "00000000-0000-0000-0000-000000000000"},
    )
    check("13. 非法 assignee → 400", (status, error["assignee"]), (400, ["所选用户不存在。"]))

    check_in("14. 冒烟账号 B（非成员）", ensure_session(b, OUTSIDER_USERNAME), (200, 201))
    status, _ = b.request("GET", f"{project_root}/issues/")
    check("15. 非成员访问 → 404 防枚举", status, 404)

    status, _ = a.request("DELETE", f"{project_root}/issues/{issue2['id']}/")
    check("16. 删除 Issue", status, 204)
    status, listing = a.request("GET", f"{project_root}/issues/")
    check("17. 删除后 count", listing["count"], 1)

    status, _ = a.request("DELETE", f"{ws_root}/")
    check("18. 清理工作区（级联）", status, 204)

    print()
    if FAILURES:
        print(f"❌ 冒烟失败 {len(FAILURES)} 项：")
        for item in FAILURES:
            print("   -", item)
        return 1
    print("✅ Sprint 3 冒烟全部通过（18 步）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"))
