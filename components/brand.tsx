/* eslint-disable @next/next/no-img-element -- small static SVG logos, swapped by replacing the files */
import { cx } from "./ui";

/**
 * Logos live in /public/brand so they can be replaced with the official files
 * without touching code:
 *   orange-business.svg         — the customer (Orange Business)
 *   exponentia-global.svg       — the invoicing company, for dark backgrounds
 *   exponentia-global-dark.svg  — the same, for white paper (printed invoices)
 *   invexal.png / invexal-light.png — the builder, for white and dark backgrounds
 */
export function OrangeMark({ size = 28, className }: { size?: number; className?: string }) {
  return <img src="/brand/orange-business.svg" alt="Orange Business" width={size} height={size} className={cx("shrink-0", className)} />;
}

export function ExponentiaLogo({ height = 22, onLight, className }: { height?: number; onLight?: boolean; className?: string }) {
  return (
    <img src={onLight ? "/brand/exponentia-global-dark.svg" : "/brand/exponentia-global.svg"} alt="Exponentia Global"
      height={height} width={Math.round(height * 168 / 32)} className={cx("shrink-0", className)} />
  );
}

/** "Powered by Exponentia Global" line for footers. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-2 text-2xs text-fg-faint", className)}>
      <span>Powered by</span>
      <ExponentiaLogo height={18} />
    </div>
  );
}

/** Invexal, who built the system. Official logo, with the wordmark lightened for dark backgrounds. */
export function InvexalLogo({ height = 16, onLight, className }: { height?: number; onLight?: boolean; className?: string }) {
  return (
    <img src={onLight ? "/brand/invexal.png" : "/brand/invexal-light.png"} alt="Invexal"
      height={height} width={Math.round(height * 760 / 200)} className={cx("shrink-0", className)} />
  );
}

/** "Made by Invexal" credit for footers. */
export function MadeBy({ className, onLight }: { className?: string; onLight?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2 text-2xs", onLight ? "text-neutral-400" : "text-fg-faint", className)}>
      <span>Made by</span>
      <InvexalLogo height={14} onLight={onLight} />
    </div>
  );
}
