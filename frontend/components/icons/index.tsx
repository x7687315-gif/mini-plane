/**
 * Self-drawn inline SVG icon set — see DESIGN.md §11.
 *
 * All icons: 16px viewBox · stroke 1.5 · round caps · round joins · currentColor.
 * They inherit `color` from the surrounding text, so they re-tint via Tailwind's text-* utilities.
 *
 * We deliberately do NOT use lucide-react / heroicons / emoji:
 * - Style must match Cormorant-italic + Inter Blueprint Editorial aesthetic
 * - Every line weight is intentional (not "default icon library stroke")
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  strokeWidth = 1.5,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.4" y1="10.4" x2="13.5" y2="13.5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="8" y1="3" x2="8" y2="13" />
    <line x1="3" y1="8" x2="13" y2="8" />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="3 6 8 11 13 6" />
  </Icon>
);

export const ChevronUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="3 10 8 5 13 10" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="10 3 5 8 10 13" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="6 3 11 8 6 13" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="2" y1="8" x2="13" y2="8" />
    <polyline points="9 4 13 8 9 12" />
  </Icon>
);

export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="2" y1="5" x2="14" y2="5" />
    <line x1="4" y1="8" x2="12" y2="8" />
    <line x1="6" y1="11" x2="10" y2="11" />
  </Icon>
);

export const SortIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="3" y1="4" x2="13" y2="4" />
    <line x1="3" y1="8" x2="11" y2="8" />
    <line x1="3" y1="12" x2="9" y2="12" />
    <polyline points="12 11 14 13 12 15" transform="translate(-1 -1)" />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" />
    <rect x="9" y="2.5" width="4.5" height="4.5" />
    <rect x="2.5" y="9" width="4.5" height="4.5" />
    <rect x="9" y="9" width="4.5" height="4.5" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="5" y1="4" x2="14" y2="4" />
    <line x1="5" y1="8" x2="14" y2="8" />
    <line x1="5" y1="12" x2="14" y2="12" />
    <circle cx="2.5" cy="4" r="0.5" fill="currentColor" />
    <circle cx="2.5" cy="8" r="0.5" fill="currentColor" />
    <circle cx="2.5" cy="12" r="0.5" fill="currentColor" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="6" r="2.5" />
    <path d="M3 13.5c.8-2.5 2.8-4 5-4s4.2 1.5 5 4" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5" />
    <polyline points="10 5 13 8 10 11" />
    <line x1="6" y1="8" x2="13" y2="8" />
  </Icon>
);