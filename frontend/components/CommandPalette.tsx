"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaces } from "@/features/workspace";

/**
 * 全局命令面板（特色 A）：Ctrl/Cmd+K 唤起，键盘可达，用于快速导航到「我的工作 / 设置 / 各工作区」。
 *
 * - 挂载在 (protected)/layout，跨页常驻（与外壳同生命周期）。
 * - 命令 = 固定入口 + 每个可访问工作区；输入即时过滤（子串匹配）。
 * - a11y：role=dialog/combobox/listbox/option，↑↓ 选择、Enter 执行、Esc 关闭、点击遮罩关闭。
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { data } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: "my-work", label: "我的工作", hint: "跨项目任务", run: () => router.push("/me/issues") },
      { id: "settings", label: "设置", hint: "个人与外观", run: () => router.push("/me") },
    ];
    for (const w of data?.results ?? []) {
      base.push({
        id: `ws-${w.id}`,
        label: w.name,
        hint: `工作区 · /${w.slug}`,
        run: () => router.push(`/w/${w.slug}`),
      });
    }
    return base;
  }, [data, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Ctrl/Cmd+K 唤起（重置查询/高亮在事件回调里做，不放 effect body，避免级联渲染）
  useEffect(() => {
    const reset = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        reset();
      }
    };
    // 供 TopBar 等处以事件方式唤起（解耦，不必共享 open 状态）
    window.addEventListener("mp:open-palette", reset);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("mp:open-palette", reset);
    };
  }, []);

  // 打开后把焦点移到输入框（纯 DOM 副作用，不改状态）
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const choose = (cmd: Command | undefined) => {
    if (!cmd) return;
    cmd.run();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={close}
    >
      <div className="absolute inset-0 bg-[rgba(20,20,20,0.35)]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="relative w-full max-w-[520px] border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="cmd-list"
          aria-label="搜索命令"
          placeholder="搜索命令 / 工作区…"
          className="w-full bg-transparent px-4 py-3 text-[14px] text-[color:var(--color-ink)] outline-none border-b border-[color:var(--color-rule)]"
        />
        <ul id="cmd-list" role="listbox" className="max-h-[52vh] overflow-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-[12px] text-[color:var(--color-ink-3)]">无匹配项</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={
                  "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] " +
                  (i === active
                    ? "bg-[color:var(--color-accent-soft)] text-[color:var(--color-ink)]"
                    : "text-[color:var(--color-ink-2)]")
                }
              >
                <span className="truncate">{c.label}</span>
                {c.hint && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)] font-sans font-medium flex-shrink-0">
                    {c.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-[color:var(--color-rule)] text-[10px] text-[color:var(--color-ink-3)] font-sans">
          ↑↓ 选择 · Enter 打开 · Esc 关闭
        </div>
      </div>
    </div>
  );
}
