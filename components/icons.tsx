// Inline stroke icons (24px grid, 1.75 stroke) — one consistent family.
type P = { size?: number; className?: string };

function I({ size = 16, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icons = {
  Grid:     (p: P) => <I {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></I>,
  Invoice:  (p: P) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/></I>,
  Building: (p: P) => <I {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></I>,
  Users:    (p: P) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></I>,
  Scale:    (p: P) => <I {...p}><path d="M12 3v18M5 21h14M3 7h18M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/></I>,
  Wrench:   (p: P) => <I {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/></I>,
  Search:   (p: P) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></I>,
  Plus:     (p: P) => <I {...p}><path d="M12 5v14M5 12h14"/></I>,
  X:        (p: P) => <I {...p}><path d="M18 6 6 18M6 6l12 12"/></I>,
  Check:    (p: P) => <I {...p}><path d="M20 6 9 17l-5-5"/></I>,
  ChevronR: (p: P) => <I {...p}><path d="m9 18 6-6-6-6"/></I>,
  ChevronL: (p: P) => <I {...p}><path d="m15 18-6-6 6-6"/></I>,
  ChevronD: (p: P) => <I {...p}><path d="m6 9 6 6 6-6"/></I>,
  Sort:     (p: P) => <I {...p}><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></I>,
  ArrowUp:  (p: P) => <I {...p}><path d="M7 17 17 7M8 7h9v9"/></I>,
  ArrowDn:  (p: P) => <I {...p}><path d="M7 7l10 10M17 8v9H8"/></I>,
  Alert:    (p: P) => <I {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></I>,
  Clock:    (p: P) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>,
  Bell:     (p: P) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></I>,
  Menu:     (p: P) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16"/></I>,
  Panel:    (p: P) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></I>,
  Calendar: (p: P) => <I {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></I>,
  MapPin:   (p: P) => <I {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></I>,
  Sparkle:  (p: P) => <I {...p}><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></I>,
  Bolt:     (p: P) => <I {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></I>,
  Info:     (p: P) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></I>,
  Logout:   (p: P) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></I>,
  Edit:     (p: P) => <I {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></I>,
  Swap:     (p: P) => <I {...p}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></I>,
};
