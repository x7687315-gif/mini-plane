"""后端端到端冒烟：真 HTTP + Session + CSRF，覆盖 Sprint 3–4 的主链路。

- Sprint 3：Issue / Label 的 CRUD、发号、ordering 白名单、越权 404；
- Sprint 4：Comment 的 CRUD、作者/Admin 权限、Issue 时间线、项目活动流。

与自动化测试的区别：测试用 `force_authenticate` 绕过认证，本脚本走真实
Cookie / CSRF / 会话中间件与序列化全链路，用来验证"前端同学能照着跑通"。

脚本会复用固定的三个冒烟账号（不存在则注册、已存在则登录），并在末尾删除
自己创建的工作区（级联清理），因此**可以反复运行而不累积数据**。

用法（另开一个终端先起服务）：

    python manage.py runserver 127.0.0.1:8000 --settings=config.settings.local
    python scripts/smoke_backend.py [base_url]
"""

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from uuid import uuid4

FAILURES = []
TOTAL_STEPS = 34

SMOKE_PASSWORD = "Pw12345678"
OWNER_USERNAME = "smoke_issue_owner"
MEMBER_USERNAME = "smoke_issue_member"
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


def check_true(label: str, condition: bool, detail="") -> None:
    print(f"[{'ok ' if condition else 'FAIL'}] {label}" + (f": {detail}" if detail else ""))
    if not condition:
        FAILURES.append(f"{label} ({detail})")


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
    a = Client(base)  # 工作区 Admin / 项目 Admin
    m = Client(base)  # 普通项目 Member
    b = Client(base)  # 非成员

    # ── 认证与骨架 ───────────────────────────────────────────────
    check("01. GET /auth/csrf/", a.request("GET", "/api/v1/auth/csrf/")[0], 200)
    check_in(
        "02. 冒烟账号 A（首跑 201 注册 / 重跑 200 登录）",
        ensure_session(a, OWNER_USERNAME),
        (200, 201),
    )

    slug = f"smoke-{stage}"
    ws_root = f"/api/v1/workspaces/{slug}"
    status, workspace = a.request("POST", "/api/v1/workspaces/", {"name": "Smoke WS", "slug": slug})
    check("03. 创建工作区", status, 201)

    status, projects = a.request(
        "POST", f"{ws_root}/projects/", {"name": "Smoke Project", "identifier": "SMK"}
    )
    check("04. 创建项目", status, 201)
    project_root = f"{ws_root}/projects/{body_of(projects, 'id')}"

    status, states = a.request("GET", f"{project_root}/states/")
    check("05. 预置五态", (status, states["count"]), (200, 5))
    done_state = next(item for item in states["results"] if item["name"] == "Done")

    # ── Sprint 3：Issue / Label ─────────────────────────────────
    status, label = a.request(
        "POST", f"{project_root}/labels/", {"name": "bug", "color": "#ef4444"}
    )
    check("06. 创建标签", status, 201)

    status, issue1 = a.request("POST", f"{project_root}/issues/", {"title": "登录页验证码不显示"})
    check(
        "07. 创建 Issue #1（默认 Backlog）",
        (status, issue1["sequence_id"], issue1["state"]["name"]),
        (201, 1, "Backlog"),
    )

    status, issue2 = a.request(
        "POST",
        f"{project_root}/issues/",
        {"title": "second issue", "priority": "urgent", "label_ids": [body_of(label, "id")]},
    )
    check(
        "08. 创建 Issue #2（优先级+标签）",
        (status, issue2["sequence_id"], issue2["priority"], len(issue2["labels"])),
        (201, 2, "urgent", 1),
    )

    status, listing = a.request("GET", f"{project_root}/issues/")
    check(
        "09. 列表默认倒序",
        (listing["count"], [i["sequence_id"] for i in listing["results"]]),
        (2, [2, 1]),
    )

    status, listing = a.request("GET", f"{project_root}/issues/?ordering=sequence_id")
    check("10. ordering 升序", [i["sequence_id"] for i in listing["results"]], [1, 2])

    status, error = a.request("GET", f"{project_root}/issues/?ordering=title")
    check(
        "11. 非法 ordering → 400", (status, error["ordering"]), (400, ["不支持的排序字段：title。"])
    )

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

    # ── 三个身份：A=Admin / M=Member / B=非成员 ──────────────────
    check_in("14. 冒烟账号 M", ensure_session(m, MEMBER_USERNAME), (200, 201))
    status, me_member = m.request("GET", "/api/v1/auth/me/")
    check("15. M 取自己的 id", status, 200)

    status, _ = a.request(
        "POST", f"{ws_root}/members/", {"email": f"{MEMBER_USERNAME}@example.com", "role": 15}
    )
    check("16. 把 M 加入工作区", status, 201)

    status, _ = a.request(
        "POST", f"{project_root}/members/", {"user_id": body_of(me_member, "id"), "role": 15}
    )
    check("17. 把 M 加入项目", status, 201)

    check_in("18. 冒烟账号 B（非成员）", ensure_session(b, OUTSIDER_USERNAME), (200, 201))

    # ── Sprint 4：Comment ──────────────────────────────────────
    status, comment_by_member = m.request(
        "POST", f"{project_root}/issues/{issue1['id']}/comments/", {"content": "M 的评论"}
    )
    check("19. M 创建评论", status, 201)

    status, comment_by_owner = a.request(
        "POST", f"{project_root}/issues/{issue1['id']}/comments/", {"content": "A 的评论"}
    )
    check("20. A 创建评论", status, 201)

    comment_root = f"{project_root}/issues/{issue1['id']}/comments"
    status, comments = a.request("GET", f"{comment_root}/")
    check(
        "21. 评论列表正序（旧的在前）",
        (status, comments["count"], body_of(comments, "results", 0)["author"]["username"]),
        (200, 2, MEMBER_USERNAME),
    )

    status, _ = a.request(
        "PATCH",
        f"{comment_root}/{body_of(comment_by_member, 'id')}/",
        {"content": "A 改写了 M 的评论"},
    )
    check("22. Admin 可改他人评论", status, 200)

    status, _ = m.request(
        "PATCH",
        f"{comment_root}/{body_of(comment_by_owner, 'id')}/",
        {"content": "越权改别人的"},
    )
    check("23. 非作者 Member 改他人评论 → 403", status, 403)

    status, error = m.request("POST", f"{comment_root}/", {"content": "   "})
    check(
        "24. 空白评论 → 400",
        (status, body_of(error, "content")),
        (400, ["该字段不能为空。"]),
    )

    # ── Sprint 4：Activity ─────────────────────────────────────
    status, timeline = a.request("GET", f"{project_root}/issues/{issue1['id']}/activities/")
    pairs = [(item["entity_type"], item["action"]) for item in body_of(timeline, "results")]
    check("25. Issue 时间线可读", status, 200)
    check_true(
        "26. 时间线含 issue.created / issue.updated / comment.created",
        {("issue", "created"), ("issue", "updated"), ("comment", "created")} <= set(pairs),
        str(pairs),
    )
    check_true(
        "27. 时间线倒序（created_at 非递增）",
        [i["created_at"] for i in timeline["results"]]
        == sorted([i["created_at"] for i in timeline["results"]], reverse=True),
    )

    status, feed = a.request("GET", f"{project_root}/activities/")
    kinds = {item["entity_type"] for item in body_of(feed, "results")}
    check("28. 项目活动流可读", status, 200)
    check_true("29. 活动流含 project 与 issue 事件", {"project", "issue"} <= kinds, str(kinds))

    status, _ = b.request("GET", f"{project_root}/issues/{issue1['id']}/activities/")
    check("30. 非成员访问活动流 → 404", status, 404)

    # ── 删除与清理 ─────────────────────────────────────────────
    status, _ = m.request("DELETE", f"{comment_root}/{body_of(comment_by_owner, 'id')}/")
    check("31. 非作者 Member 删他人评论 → 403", status, 403)

    status, _ = m.request("DELETE", f"{comment_root}/{body_of(comment_by_member, 'id')}/")
    check("32. 作者删自己的评论 → 204", status, 204)

    status, timeline = a.request("GET", f"{project_root}/issues/{issue1['id']}/activities/")
    pairs = [(item["entity_type"], item["action"]) for item in body_of(timeline, "results")]
    check_true(
        "33. 评论删除后，它的历史仍留在时间线",
        ("comment", "deleted") in pairs and ("comment", "created") in pairs,
        str(pairs),
    )

    status, _ = a.request("DELETE", f"{ws_root}/")
    check("34. 清理工作区（级联）", status, 204)

    print()
    if FAILURES:
        print(f"❌ 冒烟失败 {len(FAILURES)} 项：")
        for item in FAILURES:
            print("   -", item)
        return 1
    print(f"✅ 后端冒烟全部通过（{TOTAL_STEPS} 步）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"))
