"""桌面 Island 配置与状态机的单测（不依赖 Django / pywebview，纯文件与纯函数）。

覆盖 Island V3 单窗两态：
- 配置键位（displayMode / form / panelX/Y / panelWidth/Height）与"配置坏了也要能启动"的降级路径；
- 形态状态机四宫格（next_form / esc_collapses）；
- 展开态尺寸夹取（clamp_panel_size）；
- 折叠动画调度（resize_schedule：终点精确、逐帧单调、首帧即动）。
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import config as cfg  # noqa: E402


def with_tmp_dir(fn):
    tmp = pathlib.Path(tempfile.mkdtemp())
    cfg._runtime_dir = lambda: tmp  # type: ignore[assignment]
    try:
        fn(tmp)
    finally:
        import shutil

        shutil.rmtree(tmp, ignore_errors=True)


def test_default_when_missing():
    def body(_tmp):
        c = cfg.load_desktop_config()
        assert c["displayMode"] == "auto_hide", c
        assert c["form"] is None, c  # 未记录 = 首启，由调用方按 M1 默认首展
        assert c["panelX"] is None and c["panelY"] is None, c
        # 宽高默认不记忆（None = 用 island.py 的默认 520×420）
        assert c["panelWidth"] is None, c
        assert c["panelHeight"] is None, c

    with_tmp_dir(body)


def test_roundtrip():
    def body(_tmp):
        ok = cfg.save_desktop_config(
            {
                "displayMode": "pinned",
                "form": "expanded",
                "panelX": 640,
                "panelY": 24,
                "panelWidth": 520,
                "panelHeight": 420,
            }
        )
        assert ok, "写配置应成功"
        c = cfg.load_desktop_config()
        assert c == {
            "displayMode": "pinned",
            "form": "expanded",
            "panelX": 640,
            "panelY": 24,
            "panelWidth": 520,
            "panelHeight": 420,
        }, c

    with_tmp_dir(body)


def test_retired_keys_ignored():
    """V2 的 triggerX / onboarded 已退役：旧配置文件里的它们必须被无害忽略。"""

    def body(tmp):
        (tmp / "desktop-config.json").write_text(
            json.dumps({"displayMode": "auto_hide", "triggerX": 100, "onboarded": True}),
            encoding="utf-8",
        )
        c = cfg.load_desktop_config()
        assert "triggerX" not in c, c
        assert "onboarded" not in c, c
        assert c["displayMode"] == "auto_hide", c

    with_tmp_dir(body)


def test_corrupt_json_falls_back():
    def body(tmp):
        (tmp / "desktop-config.json").write_text("{ 这不是 JSON", encoding="utf-8")
        c = cfg.load_desktop_config()
        assert c["displayMode"] == "auto_hide", c

    with_tmp_dir(body)


def test_unknown_mode_falls_back():
    def body(tmp):
        (tmp / "desktop-config.json").write_text(
            json.dumps({"displayMode": "banana", "form": "banana", "panelX": "left"}),
            encoding="utf-8",
        )
        c = cfg.load_desktop_config()
        assert c["displayMode"] == "auto_hide", c
        assert c["form"] is None, c  # 非法形态按"未记录"处理
        assert c["panelX"] is None, c  # 非数值一律丢弃，不让窗口定位出错

    with_tmp_dir(body)


def test_bad_size_falls_back():
    """宽高写坏也不能让窗口定位出错（同 panelX 的降级路径）。"""

    def body(tmp):
        (tmp / "desktop-config.json").write_text(
            json.dumps({"panelWidth": "wide", "panelHeight": True, "panelX": 1.9}),
            encoding="utf-8",
        )
        c = cfg.load_desktop_config()
        assert c["panelWidth"] is None, c
        assert c["panelHeight"] is None, c
        assert c["panelX"] == 1, c  # 合法数值取整保留

    with_tmp_dir(body)


def test_next_form_matrix():
    # auto_hide：collapsed/expanded 翻转
    assert cfg.next_form("auto_hide", "collapsed") == "expanded"
    assert cfg.next_form("auto_hide", "expanded") == "collapsed"
    # pinned：永远展开（点了不收起）
    assert cfg.next_form("pinned", "collapsed") == "expanded"
    assert cfg.next_form("pinned", "expanded") == "expanded"


def test_esc_only_in_auto_hide():
    assert cfg.esc_collapses("auto_hide") is True
    assert cfg.esc_collapses("pinned") is False


def test_clamp_panel_size():
    # 下界：不许比把手条还小（用户从边缘往里拖）
    assert cfg.clamp_panel_size(100, 10) == (360, 44)
    # 上界：不许比屏幕还大（换过显示器时恢复记忆尺寸）
    assert cfg.clamp_panel_size(9000, 9000, max_w=1920, max_h=1080) == (1920, 1080)
    # 合法值原样通过
    assert cfg.clamp_panel_size(520, 420) == (520, 420)


def test_ease_out_cubic_endpoints():
    assert cfg.ease_out_cubic(0) == 0.0
    assert cfg.ease_out_cubic(1) == 1.0
    assert cfg.ease_out_cubic(-1) == 0.0  # 夹取
    assert cfg.ease_out_cubic(2) == 1.0
    # 单调递增（ease-out 不允许回摆）
    prev = -1.0
    for i in range(11):
        v = cfg.ease_out_cubic(i / 10)
        assert v >= prev, f"t={i / 10} 处回摆：{v} < {prev}"
        prev = v


def test_resize_schedule_collapse():
    """收起 520×420 → 360×44：终点精确、逐帧单调收缩、首帧即动。"""
    frames = cfg.resize_schedule((520, 420), (360, 44))
    assert len(frames) == cfg.ANIM_STEPS
    assert frames[-1] == (360, 44), "终点必须精确命中（浮点累计误差不许留在尺寸里）"
    assert frames[0] != (520, 420), "ease-out 首帧就要有可见位移"
    for (w0, h0), (w1, h1) in zip(frames, frames[1:], strict=False):
        assert w1 <= w0 and h1 <= h0, f"收起过程出现放大帧：{(w0, h0)} → {(w1, h1)}"


def test_resize_schedule_expand_monotonic():
    """展开 360×44 → 520×420：逐帧单调增长，终点精确。"""
    frames = cfg.resize_schedule((360, 44), (520, 420))
    assert frames[-1] == (520, 420)
    for (w0, h0), (w1, h1) in zip(frames, frames[1:], strict=False):
        assert w1 >= w0 and h1 >= h0, f"展开过程出现缩小帧：{(w0, h0)} → {(w1, h1)}"


def test_resize_schedule_same_size_is_noop():
    """目标 = 当前（理论上是 _apply_form 幂等挡掉的，这里钉纯函数也别抖）。"""
    frames = cfg.resize_schedule((520, 420), (520, 420))
    assert all(f == (520, 420) for f in frames)


if __name__ == "__main__":
    # 零依赖自跑（本仓库 desktop/ 下没有 pytest 依赖，与 backend 的 manage.py test 分开）
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  ok   {name}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL {name}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  ERR  {name}: {exc!r}")
    print(f"\n{len(tests) - failed}/{len(tests)} 通过")
    raise SystemExit(1 if failed else 0)
