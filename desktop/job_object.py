"""Windows Job Object：父进程退出时由内核回收整棵子进程树。

为什么需要它（2026-10-29 复现）：
- launcher 正常关窗时会 `taskkill /T` 自己的进程树，但**如果 launcher 是被
  任务管理器强杀、崩溃或被父进程带走的**，清理代码没有机会执行；
- WebView2 的 `msedgewebview2.exe`、Django 的 python、Next 的 node 都可能
  变成孤儿，下一次启动又会“复用”这些残留服务，越积越多。

做法：启动时创建 Job Object，设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，
把当前进程放进 Job；之后创建的子进程默认继承 Job。只要 launcher 的最后一个
Job 句柄关闭（正常退出、崩溃、被强杀都由内核关闭），Job 内所有进程都会被终止。
这是操作系统级兜底，不依赖 Python 的 finally。

参考：
- Microsoft Job Objects: 子进程默认继承 Job；KILL_ON_JOB_CLOSE 在最后一个
  句柄关闭时终止所有关联进程。
  https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- AssignProcessToJobObject / JOBOBJECT_EXTENDED_LIMIT_INFORMATION 官方 API。
"""

from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JobObjectExtendedLimitInformation = 9

_job_handle: int | None = None


class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_longlong),
        ("PerJobUserTimeLimit", ctypes.c_longlong),
        ("LimitFlags", wintypes.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wintypes.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wintypes.DWORD),
        ("SchedulingClass", wintypes.DWORD),
    ]


class _IO_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_ulonglong),
        ("WriteOperationCount", ctypes.c_ulonglong),
        ("OtherOperationCount", ctypes.c_ulonglong),
        ("ReadTransferCount", ctypes.c_ulonglong),
        ("WriteTransferCount", ctypes.c_ulonglong),
        ("OtherTransferCount", ctypes.c_ulonglong),
    ]


class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
        ("IoInfo", _IO_COUNTERS),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def enable_kill_on_close_job() -> int | None:
    """把当前进程放进 kill-on-close Job；成功返回句柄，失败/非 Windows 返回 None。

    句柄保存在模块级变量里直到进程结束；不要主动 CloseHandle，否则会提前
    杀掉 Job 内的子进程（这正是 KILL_ON_JOB_CLOSE 的语义）。
    """
    global _job_handle
    if os.name != "nt":
        return None
    if _job_handle is not None:
        return _job_handle

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    ]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.GetCurrentProcess.argtypes = []
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        return None

    info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not kernel32.SetInformationJobObject(
        job,
        JobObjectExtendedLimitInformation,
        ctypes.byref(info),
        ctypes.sizeof(info),
    ):
        kernel32.CloseHandle(job)
        return None

    if not kernel32.AssignProcessToJobObject(job, kernel32.GetCurrentProcess()):
        # 常见于当前进程已被放进不允许嵌套 Job 的父 Job；退回应用层清理。
        kernel32.CloseHandle(job)
        return None

    _job_handle = int(job)
    return _job_handle


def job_active() -> bool:
    return _job_handle is not None
