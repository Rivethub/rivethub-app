import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, strokeWidth = 2, ...rest }: P) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const SearchIcon = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const GearIcon = (p: P) => (
  <Svg {...p} fill="currentColor" strokeWidth={1}>
    <path fillRule="evenodd" d="M9.32 4.89L9.48 1.7L14.52 1.7L14.68 4.89L16.82 6.12L19.66 4.67L22.18 9.03L19.5 10.76L19.5 13.24L22.18 14.97L19.66 19.33L16.82 17.88L14.68 19.11L14.52 22.3L9.48 22.3L9.32 19.11L7.18 17.88L4.34 19.33L1.82 14.97L4.5 13.24L4.5 10.76L1.82 9.03L4.34 4.67L7.18 6.12ZM16 12A4 4 0 1 0 8 12A4 4 0 1 0 16 12Z" />
  </Svg>
);
export const TodayIcon = (p: P) => <Svg strokeWidth={1.8} {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>;
export const ReviewIcon = (p: P) => (
  <Svg strokeWidth={1.8} {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></Svg>
);
export const LibraryIcon = (p: P) => (
  <Svg strokeWidth={1.8} {...p}><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></Svg>
);
export const FolderIcon = (p: P) => <Svg strokeWidth={1.8} {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>;
export const ShareIcon = (p: P) => (
  <Svg strokeWidth={1.8} {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 5 5.5" /></Svg>
);
export const KeepIcon = (p: P) => <Svg strokeWidth={1.8} {...p}><path d="M6 3h12v18l-6-4-6 4z" /></Svg>;
export const TrashIcon = (p: P) => <Svg strokeWidth={1.8} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const PinIcon = (p: P) => <Svg {...p}><path d="M12 17v5M9 3h6l-1 6 3 4H7l3-4z" /></Svg>;
export const BackIcon = (p: P) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const CheckIcon = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const XIcon = (p: P) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
