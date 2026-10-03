"""把「Mini Plane 这个项目自己的进度」导入 Mini Plane。

用途：实地检验这套系统承不承载真实工程数据 —— 计划里的 17 个 Sprint、
真实的待办与结论、真实的工程日志，而不是 E2E 那种"2 个项目 3 条假任务"。

数据来源：本仓库的 docs/devlog/、frontend/docs/devlog/ 与 PRODUCT_REFACTOR_PLAN
的版本路线（见 SOURCES 注释）。**不是编的**——每条任务都对应一次真实提交或一次真实修复。

用法（两种数据库都能跑）：
    # 桌面单机版的数据（SQLite，桌面 App 打开就能看到）
    set DJANGO_SETTINGS_MODULE=config.settings.desktop
    backend\\.venv\\Scripts\\python.exe scripts\\import_progress.py

    # 开发库（PostgreSQL，配合 localhost:3000 预览）
    set DJANGO_SETTINGS_MODULE=config.settings.local
    backend\\.venv\\Scripts\\python.exe scripts\\import_progress.py

幂等：重复运行会先清掉上一次导入的产物（按项目标识 MP 定位）。
"""

from __future__ import annotations

import datetime as dt
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.desktop")

import django  # noqa: E402

django.setup()

from apps.agents import services as agent_services  # noqa: E402
from apps.agents.models import AgentToken  # noqa: E402
from apps.issues.models import IssuePriorities  # noqa: E402
from apps.issues.services import create_issue, create_label, update_issue  # noqa: E402
from apps.projects.models import Project, ProjectStage  # noqa: E402
from apps.projects.services import create_project, get_or_create_plan  # noqa: E402
from apps.users.models import User  # noqa: E402
from apps.worklogs.models import Worklog, WorklogSource  # noqa: E402
from apps.workspaces.models import Workspace  # noqa: E402
from apps.workspaces.models import WorkspaceMember, WorkspaceRoles  # noqa: E402

IDENTIFIER = "MP"
PROJECT_NAME = "Mini Plane"
DEMO_NAME = "engineer"

# ── Global Plan：五个阶段（权重按"这件事占多少比重"给，不是随手填 1）
# SOURCES: PRODUCT_REFACTOR_PLAN §28 的 Sprint 09–17 + 今天的收尾与发版
STAGES = [
    ("产品定位重构", "把产品中心从「任务」移到「工程」", 2, 100, False),
    ("领域模型扩展", "Plan / Stage / Worklog 三件套", 2, 100, False),
    ("Agent 接入", "Token · 幂等 · Session · 实时投影", 2, 100, False),
    ("Engineering Island", "图纸页 · 桌面悬浮窗 · 图纸视觉", 3, 100, False),
    ("收束与发布", "个人⇄团队切换 · v1.0.0 发版 · 桌面收尾", 2, 60, True),
]

# ── 任务：每条都对应真实完成的工作（done=True）或真实待办
# (标题, 说明, 状态, 优先级, 标签)
D = "done"
T = "todo"
TASKS = [
    (
        "Sprint 09 · 我的工程首页",
        "跨项目聚合改为单条 SQL 聚合（Subquery/Coalesce/Exists），Workspace 降级为协作层",
        D,
        "high",
        ["重构"],
    ),
    (
        "Sprint 10 · Global Plan / Stage",
        "ProjectPlan + ProjectStage，加权进度 Σ(权重×进度)/Σ权重",
        D,
        "high",
        ["重构", "模型"],
    ),
    (
        "Sprint 11 · 工程日志 Worklog",
        "与 Task 严格分开：结论 / 下一步 / 阻塞 / 来源标记",
        D,
        "high",
        ["重构", "模型"],
    ),
    (
        "Sprint 12 · Agent Local API",
        "Token 只存哈希 · scope 白名单 · Idempotency-Key 幂等",
        D,
        "urgent",
        ["Agent"],
    ),
    (
        "Sprint 13 · Agent Session",
        "会话状态事务内广播 agent.session，实时投影到界面与 Island",
        D,
        "high",
        ["Agent", "实时"],
    ),
    (
        "Sprint 14 · Engineering Island MVP",
        "一张图纸 = 一个项目；左右滑动翻图纸；NOW/TODAY/NEXT/AGENT",
        D,
        "high",
        ["Island"],
    ),
    (
        "Sprint 15 · 桌面 Island 独立窗口",
        "置顶 · 无边框可拖 · 顶部居中 · 隐藏启动 · Alt+I 唤出",
        D,
        "medium",
        ["Island", "桌面"],
    ),
    (
        "Sprint 16 · Island 图纸视觉",
        "双线框 / 蓝图网格 / 十字准星 / FIG·SHEET·REV，200ms 只动 transform",
        D,
        "medium",
        ["Island", "设计"],
    ),
    (
        "Sprint 17 · 个人 ⇄ 团队模式切换",
        "顶栏 ⇄ 按钮，URL 即状态，记住上次停留的团队位置",
        D,
        "high",
        ["体验", "重构"],
    ),
    (
        "登录页「直接进入」",
        "记住上次是谁：免密直进 / 需密码落到密码步 / 账户已删则清记忆",
        D,
        "medium",
        ["体验"],
    ),
    (
        "README 对外展示版重写",
        "逐屏界面导览 + 全部功能 + Agent 接入说明，作为 GitHub 主页",
        D,
        "medium",
        ["文档"],
    ),
    (
        "v1.0.0 隐私扫描与发版",
        "424 个跟踪文件零泄漏；Release v1.0.0 + 单机包 15.2MB",
        D,
        "high",
        ["发版"],
    ),
    (
        "桌面版关窗后进程残留（待决策）",
        "关主窗口时 Island 窗口仍开着 → pywebview 不返回 → 端口不释放",
        T,
        "urgent",
        ["桌面", "待决策"],
    ),
    (
        "Markdown → Worklog 自动导入",
        "解析 docs/devlog/*.md 写入 Worklog，并记录原始文件路径",
        T,
        "medium",
        ["模型"],
    ),
    ("组件测试（Vitest）", "当前只测纯函数；组件与 hooks 仍未覆盖", T, "low", ["测试"]),
    ("Lighthouse 90", "现为 89（perf），LCP 3.36s 需服务端预取", T, "low", ["体验"]),
]

# ── 工程日志：真实的两天，真实写下了什么
WORKLOGS = [
    {
        "date": dt.date(2026, 10, 2),
        "title": "Island 落地，以及桌面版产物停滞 10 天的根因",
        "summary": "Sprint 14–16：Island MVP、桌面独立窗口、图纸视觉；期间发现桌面版跑的仍是 9 月 21 日的构建。",
        "details": (
            "Sprint 14 把 Island 做成 /island（一张图纸 = 一个项目，左右滑动翻页）；"
            "Sprint 15 扩成独立桌面窗口（置顶 / 可拖 / 顶部居中 / 隐藏启动）；"
            "Sprint 16 补齐图纸语汇（双线框、8px 网格、十字准星、FIG·SHEET·REV）。\n\n"
            "**根因不是技术，是流程**：dist/ 不进仓库是对的，但我在这几天全程用 pnpm dev 跑 E2E，"
            "一次都没重建过桌面版产物。更糟的是打包脚本第一步就要删上次的临时构建目录，"
            "撞上批量删除保护后**进程被直接终止**（日志只有一行拦截记录、没有 traceback），"
            "于是它在这台机器上根本跑不起来。"
        ),
        "conclusion": (
            "Island 的信息结构与视觉已到位；桌面版交付链断了。\n"
            "把打包脚本改成零删除（唯一临时目录 + 目标存在就换时间戳目录名）后一次跑通。"
        ),
        "next_step": "把「改前端必须重建产物」写进协作约定；启动器改为优先选带 venv 的仓库根。",
        "source": WorklogSource.MANUAL,
    },
    {
        "date": dt.date(2026, 10, 3),
        "title": "v1.0.0 收束：Agent 闭环跑通 + 两处 CI 红灯 + 隐私扫描与发版",
        "summary": "Sprint 17 + Agent→Island 闭环 E2E；修 CI 红灯；桌面启动器回归；发版。",
        "details": (
            "**Agent → Island 闭环**（计划 §29 一直欠着的一条链路）：建 Agent Token → "
            "换身份起会话 → Island 不刷新就变 RUNNING。因为 /projects/mine/ 没有轮询，"
            "这条用例只有 WebSocket 真把事件推到界面才会通过。\n\n"
            "**两处红灯都在我这边**：E2E 用了 DemoFixture 不存在的字段；"
            "顶栏断言用裸 header 选择器撞了 strict mode violation（页面里有 3 个 header）。\n"
            "两次都是同一根因：写完测试没先跑 tsc —— E2E 跑在 tsx 上，类型错不会让它失败。\n\n"
            "**桌面版回归**：重建 exe 后双击报「后端虚拟环境不存在」——"
            "启动器把「有 manage.py 的目录」当仓库根，命中了不带 .venv 的 dist 副本。"
        ),
        "conclusion": (
            "功能面全部收束，E2E 33 条 / 单测 129 / 后端 334 全绿，CI 双 job success。\n"
            "424 个跟踪文件零隐私泄漏，v1.0.0 已发版。"
        ),
        "next_step": "待决策：关主窗口是否直接退出应用（连带销毁 Island 窗口）。",
        "source": WorklogSource.AGENT,
    },
]

AGENT_SESSION_TITLE = "README 对外展示版与 v1.0.0 收尾"


def main() -> int:
    # 1) 找操作者
    #
    # 默认用 DEMO_USER 这个**免密**账户（没有就建）：本机版是"昵称直入"的语义，
    # 用免密账户才能一条命令完成「导入 → 免密登录 → 截图/浏览」的全链路。
    # 想导给自己的账户：IMPORT_USER=你的昵称 即可。
    demo_name = os.environ.get("DEMO_USER", DEMO_NAME)
    actor = User.objects.filter(username=demo_name).first()
    created_now = actor is None
    if created_now:
        actor = User.objects.create_user(username=demo_name, email="", password="")
        # create_user(password="") 仍会生成"空串哈希"，后端据此判定"设过密码"，
        # 于是免密登录被拒。必须显式清空字段才真正是免密账户。
        # 只清**我们刚建的**账户 —— 绝不碰用户自己设过密码的账户。
        actor.set_unusable_password()
        actor.save(update_fields=["password"])
        print(f"已创建免密演示账户：{actor.username}")
    elif actor.has_usable_password():
        # 判据必须是 has_usable_password()：Django 里「无密码」是 set_unusable_password()
        # 写下的 "!" 标记，而**空字符串仍算可用密码**（会被判成"设过密码"）。
        if demo_name == DEMO_NAME:
            # 自建演示账户：残留的 create_user(password="") 空串哈希 → 自愈为免密
            actor.set_unusable_password()
            actor.save(update_fields=["password"])
            print(f"已把演示账户 {actor.username} 恢复为免密")
        else:
            print(f"注意：账户 {actor.username} 设过密码，免密登录会被拒；换个 DEMO_USER 再跑。")
    print(f"操作者：{actor.username}")

    # 2) 工作区：优先用该账户已有的；没有就按账户名建一个（slug 必须唯一，
    #    撞了就复用而不是加随机后缀——重复运行要落在同一个地方才好对比）
    workspace = Workspace.objects.filter(members__user=actor).order_by("created_at").first()
    if workspace is None:
        slug = f"mini-plane-{demo_name}"
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            workspace = Workspace.objects.create(name="Mini Plane 开发", slug=slug, owner=actor)
            print(f"已创建工作区：{workspace.name}（{slug}）")
        if not workspace.members.filter(user=actor).exists():
            WorkspaceMember.objects.create(
                workspace=workspace, user=actor, role=WorkspaceRoles.ADMIN
            )
            print("已把当前账户加进该工作区")
    print(f"工作区：{workspace.name}")

    # 3) 幂等：清掉上一次导入
    old = Project.objects.filter(workspace=workspace, identifier=IDENTIFIER).first()
    if old is not None:
        print(f"清掉上一次导入的项目：{old.name}")
        Worklog.objects.filter(project=old).delete()
        from apps.issues.models import Issue

        Issue.objects.filter(project=old).delete()
        old.delete()

    project = create_project(
        workspace,
        actor,
        name=PROJECT_NAME,
        identifier=IDENTIFIER,
        description="本地运行的个人工程管理系统（v1.0.0）",
    )
    print(f"项目已建：{project.name} / {project.identifier}")

    # 4) 标签
    labels = {
        n: create_label(project, name=n, color=c)
        for n, c in [
            ("重构", "#1F3FA8"),
            ("Island", "#0F766E"),
            ("Agent", "#7C3AED"),
            ("实时", "#B45309"),
            ("桌面", "#334155"),
            ("设计", "#9D174D"),
            ("体验", "#0369A1"),
            ("模型", "#4D7C0F"),
            ("发版", "#B91C1C"),
            ("文档", "#525252"),
            ("测试", "#166534"),
            ("待决策", "#A16207"),
        ]
    }

    # 5) 任务
    states = {s.group: s for s in project.states.all()}
    from apps.issues.models import State

    backlog = project.states.filter(name="Backlog").first()
    done_state = project.states.filter(name="Done").first()
    todo_state = project.states.filter(name="Todo").first()
    doing = project.states.filter(name="In Progress").first()
    assert backlog and done_state and todo_state and doing

    created = []
    for title, desc, status, prio, label_names in TASKS:
        issue = create_issue(
            project,
            actor,
            title=title,
            description=desc,
            priority=getattr(IssuePriorities, prio.upper()),
            state=done_state if status == D else todo_state,
            labels=[labels[n] for n in label_names],
        )
        created.append(issue)
    print(
        f"任务已建：{len(created)} 条（{sum(1 for i in created if i.state_id == done_state.id)} 条 Done）"
    )

    # 6) Global Plan
    plan = get_or_create_plan(project)
    stage_objs = []
    for order, (name, goal, weight, progress, is_current) in enumerate(STAGES, start=1):
        st = ProjectStage.objects.create(
            plan=plan,
            order=order,
            name=name,
            goal=goal,
            weight=weight,
            progress=progress,
            is_current=is_current,
        )
        stage_objs.append(st)
    print(f"阶段已建：{len(stage_objs)} 个（当前阶段：{stage_objs[-1].name}）")

    # 7) 工程日志
    for w in WORKLOGS:
        Worklog.objects.create(
            project=project,
            stage=stage_objs[-2] if w["date"].day == 2 else stage_objs[-1],
            author=actor,
            date=w["date"],
            title=w["title"],
            summary=w["summary"],
            details=w["details"],
            conclusion=w["conclusion"],
            next_step=w["next_step"],
            source=w["source"],
        )
    print(f"工程日志已建：{len(WORKLOGS)} 条")

    # 8) 起一个 Agent 会话（真实：现在确实有个 Agent 在干这件事）
    token, raw = AgentToken.mint(actor, name="import-progress", scopes=None)
    agent_services.start_session(project=project, token=token, title=AGENT_SESSION_TITLE)
    print(f"Agent 会话已启动：{AGENT_SESSION_TITLE}（所以 Island 上 AGENT 是 RUNNING）")

    print("\n完成。现在打开应用就能看到：")
    print("  · 我的工程首页 → Mini Plane 卡片（进度 / NOW / NEXT / 今日日志）")
    print("  · /island → 图纸页（阶段 / 进度 / 明日 TODAy / AGENT RUNNING）")
    print("  · 项目页 → GLOBAL PLAN 五阶段 + TASKS 16 条 + ENGINEERING LOG 两条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
