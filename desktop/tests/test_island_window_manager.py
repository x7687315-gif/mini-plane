"""Island V3 单窗状态机的行为单测（桩窗口，不需要 pywebview / Django）。

纯函数（config.py）在 test_island_config.py 里钉；这里钉**WindowManager 的行为**：
形态切换的窗口落点、动画终点、pinned 护栏、尺寸记忆与恢复、"关了就不响应"。

桩窗口记录每次 resize/move 调用；动画跑在 daemon 线程里（15×16ms ≈ 250ms），
用轮询等它跑完再断言——**不 sleep 定长时间**（慢机器上会假红）。
"""

from __future__ import annotations

import pathlib
import sys
import tempfile
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import window_manager as wmmod  # noqa: E402

import config as cfg  # noqa: E402


class StubEvents:
    """pywebview 的 events 容器：支持 `events.moved += handler`。"""

    def __init__(self) -> None:
        self.moved: list = []
        self.closed: list = []


class StubWindow:
    """记录 resize/move 调用的假窗口（FixPoint 在没有 pywebview 的环境下是 None，
    桩窗口照样收得到 fix_point 参数——_resize 会走 `win.resize(w, h)` 分支）。"""

    def __init__(self, width: int = 520, height: int = 420, x: int = 100, y: int = 50) -> None:
        self.width = width
        self.height = height
        self.x = x
        self.y = y
        self.resizes: list[tuple[int, int]] = []
        self.moves: list[tuple[int, int]] = []
        self.events = StubEvents()

    def resize(self, width: int, height: int, fix_point=None) -> None:  # noqa: ANN001
        self.resizes.append((width, height))
        self.width, self.height = width, height

    def move(self, x: int, y: int) -> None:
        self.moves.append((x, y))
        self.x, self.y = x, y


def wait_size(win: StubWindow, size: tuple[int, int], timeout: float = 3.0) -> None:
    """等窗口实际尺寸到达目标（动画末帧即目标）。

    不数 resize 调用次数：手动缩放（resize_window_by）也记在同一条记录里，
    按次数等会把"动画还没跑完"误判成"跑完了"（本项目测试设计教训：
    读一次快照再判断都是赌时序，要用会重试的断言）。
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if (win.width, win.height) == size:
            return
        time.sleep(0.01)
    raise AssertionError(f"窗口未在 {timeout}s 内到达 {size}：resizes={win.resizes[-5:]}")


def fresh_manager(tmp: pathlib.Path) -> wmmod.WindowManager:
    cfg._runtime_dir = lambda: tmp  # type: ignore[assignment]
    return wmmod.WindowManager()


def test_toggle_collapses_to_bar_size(tmp):
    """auto_hide 下 toggle：520×420 → 动画逐帧 → 精确落在 360×44。"""
    wm = fresh_manager(tmp)
    state = wm.restore_preferences()
    assert state["form"] == "expanded" and state["displayMode"] == "auto_hide", state

    win = StubWindow()
    wm.register_island(win)
    result = wm.toggle_island()
    assert result["form"] == "collapsed" and result["expanded"] is False, result
    wait_size(win, (360, 44))
    assert win.resizes[-1] == (360, 44), f"收起终点必须精确：{win.resizes[-3:]}"
    # 逐帧单调收缩（动画调度的行为层复检）
    for (w0, _), (w1, _) in zip(win.resizes, win.resizes[1:], strict=False):
        assert w1 <= w0
    assert cfg.load_desktop_config()["form"] == "collapsed"


def test_collapse_keeps_panel_size_and_expand_restores_it(tmp):
    """收起不动记忆尺寸；展开回到用户缩放过的 700×500（不是默认 520×420）。"""
    wm = fresh_manager(tmp)
    wm.restore_preferences()
    win = StubWindow()
    wm.register_island(win)

    # 用户手动把面板缩到 700×500 并结束拖动 → 落盘
    wm.resize_window_by("bottomright", 180, 80)
    wm.end_window_drag()
    assert cfg.load_desktop_config()["panelWidth"] == 700

    # 收起 → 360×44；记忆的 700×500 不许被 360×44 污染
    wm.collapse_island()
    wait_size(win, (360, 44))
    saved = cfg.load_desktop_config()
    assert saved["panelWidth"] == 700 and saved["panelHeight"] == 500, saved
    assert saved["form"] == "collapsed", saved

    # 再展开 → 动画回到 700×500
    wm.toggle_island()
    wait_size(win, (700, 500))
    assert win.resizes[-1] == (700, 500), f"展开应回到记忆尺寸：{win.resizes[-3:]}"
    assert (win.width, win.height) == (700, 500)


def test_pinned_never_collapses(tmp):
    """pinned：collapse 被状态机挡下，窗口尺寸不动。"""
    wm = fresh_manager(tmp)
    wm.restore_preferences()
    win = StubWindow()
    wm.register_island(win)

    wm.pin_island()
    result = wm.collapse_island()
    assert result["ok"] is True and result["pinned"] is True, result
    assert result["form"] == "expanded", "pinned 下不许收起"
    assert win.resizes == [], "被挡下的收起不该碰窗口"
    assert cfg.load_desktop_config()["displayMode"] == "pinned"

    # toggle 同样不收起（next_form 在 pinned 下恒 expanded）
    result = wm.toggle_island()
    assert result["form"] == "expanded" and win.resizes == []

    # 取消固定：不自动收起（规格 §2），面板还在
    result = wm.unpin_island()
    assert result["pinned"] is False and result["expanded"] is True, result


def test_collapsed_refuses_resize(tmp):
    """收起态不接受缩放（把手条尺寸是稳定的 360×44）。"""
    wm = fresh_manager(tmp)
    wm.restore_preferences()
    win = StubWindow()
    wm.register_island(win)
    wm.collapse_island()
    wait_size(win, (360, 44))
    result = wm.resize_window_by("bottomright", 100, 100)
    assert result["ok"] is False and "收起态" in result["message"], result
    assert (win.width, win.height) == (360, 44)


def test_no_window_fails_gracefully(tmp):
    """没启用 Island（或窗口已关）时，API 调用如实失败而不是抛异常。"""
    wm = fresh_manager(tmp)
    wm.restore_preferences()
    result = wm.toggle_island()
    assert result["ok"] is False and result["registered"] is False, result

    win = StubWindow()
    wm.register_island(win)
    wm._on_island_closed()  # 用户 Alt+F4 关了 Island 窗口
    result = wm.toggle_island()
    assert result["ok"] is False and "已关闭" in result["message"], result
    assert result["registered"] is False


def test_restore_remembers_form(tmp):
    """重启恢复：记住的是 collapsed 就以把手条回来；没记过就默认展开（M1）。"""
    cfg._runtime_dir = lambda: tmp  # type: ignore[assignment]
    cfg.save_desktop_config({"displayMode": "auto_hide", "form": "collapsed"})
    wm = wmmod.WindowManager()
    state = wm.restore_preferences()
    assert state["form"] == "collapsed", state

    wm2 = wmmod.WindowManager()
    state2 = wm2.restore_preferences({"displayMode": "pinned", "form": "collapsed"})
    assert state2["form"] == "expanded", "pinned 恒展开，且配置里的 form 被归一化"


def test_moved_persists_position_throttled(tmp):
    """拖动 → 位置落盘；节流期间的高频 moved 不逐次写盘。"""
    wm = fresh_manager(tmp)
    wm.restore_preferences()
    win = StubWindow()
    wm.register_island(win)

    win.move(640, 24)
    wm._on_window_moved()  # 第一次：写盘
    assert cfg.load_desktop_config()["panelX"] == 640
    win.move(700, 30)
    wm._on_window_moved()  # 0.25s 内：被节流挡下
    assert cfg.load_desktop_config()["panelX"] == 640, "节流期内不该重复写盘"
    wm.end_window_drag()  # 强制补最后一次
    assert cfg.load_desktop_config()["panelX"] == 700


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        tmp = pathlib.Path(tempfile.mkdtemp())
        cfg._runtime_dir = lambda t=tmp: t  # type: ignore[assignment]  # 默认参数绑定，防晚期绑定
        try:
            fn(tmp)
            print(f"  ok   {name}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  ERR  {name}: {exc!r}")
        finally:
            import shutil

            shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(tests) - failed}/{len(tests)} 通过")
    raise SystemExit(1 if failed else 0)
