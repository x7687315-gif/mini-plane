"""desktop 测试的共享 fixtures。

`tmp`：每个测试一个独立临时目录（用完即焚）。config 模块的落盘路径由
`config._runtime_dir` 指向它（见各测试的 `fresh_manager`），测试之间互不污染。

历史教训：曾经测试写成 `def test_x(tmp)` 的 fixture 风格，却忘了建本文件，
结果 7 条行为测试**一条都没跑过**却被写成"7/7 通过"（假绿比没做更糟）。
没有 conftest 的 pytest 风格测试 = 不存在。新写测试先跑一遍再记绿灯。
"""

from __future__ import annotations

import pathlib
import shutil
import tempfile

import pytest


@pytest.fixture
def tmp() -> pathlib.Path:
    d = pathlib.Path(tempfile.mkdtemp(prefix="miniplane-island-"))
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)
