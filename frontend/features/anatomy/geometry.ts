/** Anatomy V2 的纯几何原语：等距投影、盒子面、文本宽度估算。 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IsoOrigin {
  x: number;
  y: number;
}

export const ISO_COS = Math.cos(Math.PI / 6);
export const ISO_SIN = 0.5;

/** 30° 等距投影；z 向屏幕上方。 */
export function project(origin: IsoOrigin, x: number, y: number, z = 0): Point {
  return {
    x: origin.x + (x - y) * ISO_COS,
    y: origin.y + (x + y) * ISO_SIN - z,
  };
}

export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** 盒子三个可见面（top / right / front），局部坐标以盒子中心为原点。 */
export interface BoxFaces {
  top: Point[];
  right: Point[];
  front: Point[];
}

export function boxFaces(
  origin: IsoOrigin,
  x: number,
  y: number,
  z: number,
  a: number,
  b: number,
  h: number,
): BoxFaces {
  const p = (px: number, py: number, pz: number) => project(origin, px, py, pz);
  return {
    top: [p(x, y, z + h), p(x + a, y, z + h), p(x + a, y + b, z + h), p(x, y + b, z + h)],
    right: [
      p(x + a, y, z + h),
      p(x + a, y + b, z + h),
      p(x + a, y + b, z),
      p(x + a, y, z),
    ],
    front: [
      p(x, y + b, z + h),
      p(x + a, y + b, z + h),
      p(x + a, y + b, z),
      p(x, y + b, z),
    ],
  };
}

export function boundsOf(points: readonly Point[]): Rect {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function unionBounds(rects: readonly Rect[]): Rect {
  const valid = rects.filter((r) => r.w > 0 && r.h > 0);
  if (!valid.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...valid.map((r) => r.x));
  const y = Math.min(...valid.map((r) => r.y));
  const right = Math.max(...valid.map((r) => r.x + r.w));
  const bottom = Math.max(...valid.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** 近似文本宽度：CJK/emoji 按 1em，西文按 0.58em。只用于布局避让，不用于渲染。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) {
    units += char.codePointAt(0)! > 0x2e80 ? 1 : 0.58;
  }
  return units * fontSize;
}

/** 按 Unicode code point 截断，附加省略号；不改变原始模型数据。 */
export function truncateText(text: string, maxChars: number): string {
  const chars = [...text];
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars - 1).join("")}…`;
}

/** 按估算宽度截断（用于 SVG 标签，保证不越出模块列）。 */
export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
  const ellipsis = "…";
  const budget = Math.max(0, maxWidth - estimateTextWidth(ellipsis, fontSize));
  let out = "";
  for (const char of text) {
    if (estimateTextWidth(out + char, fontSize) > budget) break;
    out += char;
  }
  return `${out}${ellipsis}`;
}
