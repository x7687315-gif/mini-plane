"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Blueprint v2 共享原语（Phase 5）——五屏复用同一套，整体感来自原语统一。
 * 样式类在 globals.css「Blueprint v2 原语」一节，只用既有 design tokens。
 */

/** 尺寸标注线进度：建筑图纸 dimension line（端点刻度 + 钴蓝填充段）。 */
export function DimProgress({
  value,
  className,
}: {
  /** 0~100 整数（DOMAIN_MODEL §3 统一量纲）。 */
  value: number;
  className?: string;
}) {
  const v = Math.min(100, Math.max(0, Math.round(value || 0)));
  return (
    <span className={clsx("v2-dim", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <i className="fill" style={{ width: `${v}%` }} />
      <i className="tick" style={{ left: 0 }} />
      {v > 0 && v < 100 && <i className="tick" style={{ left: `${v}%` }} />}
      <i className="tick" style={{ right: 0 }} />
    </span>
  );
}

/** 区块标题：小型大写 + 细线延伸；n 为等宽计数（可选）。 */
export function SectionHead({ t, n }: { t: string; n?: string | number }) {
  return (
    <div className="v2-sec">
      <span className="t">{t}</span>
      {n != null && <span className="n">{n}</span>}
    </div>
  );
}

/** 墨水动作：钴蓝文字 + ▸，无框（每屏至多一个高强调位）。 */
export function InkAction({
  children,
  onClick,
  className,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx("v2-ia", className)}>
      <span className="mk" aria-hidden>
        ▸
      </span>
      {children}
    </button>
  );
}

/** 手写横线字段：label + 只有底线的输入。 */
export function RuledField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="v2-wline">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** 本机日期 YYYY.MM.DD（ SSR/CSR 差异由调用方 suppressHydrationWarning 处理）。 */
export function localDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
