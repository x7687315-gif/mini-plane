"""桌面 Island 配置与状态机的单测（不依赖 Django / pywebview，纯文件与纯函数）。

覆盖规格 §2.3 的四宫格与"配置坏了也要能启动"的降级路径。
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "desktop"))

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
        assert c["triggerX"] is None, c

    with_tmp_dir(body)


def test_roundtrip():
    def body(_tmp):
        ok = cfg.save_desktop_config(
            {"displayMode": "pinned", "triggerX": 100, "panelX": 640, "panelY": 24}
        )
        assert ok, "写配置应成功"
        c = cfg.load_desktop_config()
        assert c == {"displayMode": "pinned", "triggerX": 100, "panelX": 640, "panelY": 24}, c

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
            json.dumps({"displayMode": "banana", "triggerX": "left"}), encoding="utf-8"
        )
        c = cfg.load_desktop_config()
        assert c["displayMode"] == "auto_hide", c
        assert c["triggerX"] is None, c  # 非数值一律丢弃，不让窗口定位出错

    with_tmp_dir(body)


def test_next_visibility_matrix():
    # auto_hide：翻转
    assert cfg.next_visibility("auto_hide", "hidden") == "expanded"
    assert cfg.next_visibility("auto_hide", "expanded") == "hidden"
    # pinned：永远展开（点了不收起）
    assert cfg.next_visibility("pinned", "hidden") == "expanded"
    assert cfg.next_visibility("pinned", "expanded") == "expanded"


def test_esc_only_in_auto_hide():
    assert cfg.esc_collapses("auto_hide") is True
    assert cfg.esc_collapses("pinned") is False


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
