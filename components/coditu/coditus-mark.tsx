import { cn } from "@/lib/utils";

/**
 * The Coditu mark — "Aperture C".
 *
 * One tapered stroke on a 32x32 grid, 284 degrees clockwise from +38, path
 * radius 11, terminals cut on the radial with a w/2 round. Shipped variant:
 * 76-degree aperture, taper 2.0 -> 4.0, node inset 0.6 (r 1.6) — the variant
 * that survives 20px. Path is byte-identical to `public/brand/mark.svg`.
 *
 * Named `CoditusMark` because that is the name the implementation brief ships
 * it under. It reads like a typo; it is the contract. Do not "fix" it without
 * updating docs/05-DECISIONS.md and every reference.
 *
 * This is a Server Component. All three motion states are CSS, so the mark —
 * including the app's only spinner — costs zero JavaScript.
 */

const ARC_PATH =
  "M26.244 24.004 L25.263 25.089 L24.169 26.055 L22.974 26.89 L21.696 27.585 L20.35 28.13 L18.953 28.52 L17.524 28.75 L16.081 28.818 L14.642 28.723 L13.226 28.468 L11.849 28.055 L10.53 27.492 L9.285 26.785 L8.129 25.944 L7.077 24.98 L6.142 23.905 L5.335 22.735 L4.666 21.484 L4.143 20.167 L3.772 18.803 L3.557 17.408 L3.5 16 L3.602 14.597 L3.86 13.218 L4.271 11.878 L4.83 10.596 L5.527 9.386 L6.355 8.265 L7.301 7.246 L8.355 6.341 L9.501 5.563 L10.725 4.919 L12.012 4.417 L13.344 4.065 L14.705 3.864 L16.077 3.818 L17.444 3.927 L18.786 4.188 L20.089 4.597 L21.335 5.15 L22.508 5.837 L23.595 6.651 L24.582 7.58 L25.456 8.612 A 1 1 0 0 1 23.88 9.843 L23.88 9.843 L23.122 9.012 L22.277 8.274 L21.356 7.636 L20.372 7.108 L19.337 6.694 L18.265 6.4 L17.168 6.229 L16.062 6.182 L14.961 6.26 L13.877 6.461 L12.826 6.781 L11.819 7.217 L10.87 7.762 L9.991 8.409 L9.192 9.148 L8.482 9.971 L7.872 10.867 L7.366 11.823 L6.973 12.828 L6.696 13.867 L6.538 14.93 L6.5 16 L6.583 17.065 L6.784 18.112 L7.102 19.127 L7.53 20.098 L8.064 21.012 L8.695 21.858 L9.416 22.626 L10.217 23.306 L11.087 23.891 L12.015 24.373 L12.988 24.746 L13.996 25.007 L15.023 25.153 L16.058 25.182 L17.087 25.094 L18.098 24.892 L19.076 24.579 L20.011 24.158 L20.891 23.636 L21.704 23.021 L22.44 22.319 L23.092 21.541 A 2 2 0 0 1 26.244 24.004 Z";

/** 2 * PI * 11, the arc's own path radius. The draw mask sweeps this circle. */
const ARC_CIRCUMFERENCE = 69.115;

export const CODITU_GRADIENT_ID = "coditu-signal";

/**
 * Renders the cobalt->aqua gradient once per document. Mount it in the root
 * layout; every `<CoditusMark />` then references it by id instead of carrying
 * a duplicate `<defs>` — and duplicate ids in one document are exactly how a
 * gradient silently resolves to the wrong definition.
 */
export function CoditusMarkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", overflow: "hidden" }}>
      <defs>
        <linearGradient id={CODITU_GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2B57FF" />
          <stop offset="1" stopColor="#21E2C6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export type MarkVariant = "gradient" | "mono";

export interface CoditusMarkProps {
  /** Rendered size in px. Never below 20 — the mark stops reading. */
  size?: number;
  variant?: MarkVariant;
  /** Draw-on: the arc resolves over 900ms, then the node overshoots in. Hero only, once. */
  animated?: boolean;
  /** The app's only spinner. 1.4s linear, about the 16,16 origin. */
  spin?: boolean;
  /** Node runs the arc on hover/focus of this element. For the navbar lockup. */
  hoverTravel?: boolean;
  /**
   * Carry an own `<defs>` instead of referencing the document-level gradient.
   * For contexts rendered in isolation — the PDF route, an OG image — where the
   * root layout's defs are not in the tree.
   */
  standalone?: boolean;
  /** Omit to render decorative and `aria-hidden`. */
  title?: string;
  className?: string;
}

export function CoditusMark({
  size = 26,
  variant = "gradient",
  animated = false,
  spin = false,
  hoverTravel = false,
  standalone = false,
  title,
  className,
}: CoditusMarkProps) {
  const gradientId = standalone ? `${CODITU_GRADIENT_ID}-local` : CODITU_GRADIENT_ID;
  const maskId = `${gradientId}-draw-mask`;
  const arcFill = variant === "mono" ? "currentColor" : `url(#${gradientId})`;
  const nodeFill = variant === "mono" ? "currentColor" : "#21E2C6";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn(spin && "cd-spin", hoverTravel && "cd-mark-hover", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0 }}
    >
      {standalone && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2B57FF" />
            <stop offset="1" stopColor="#21E2C6" />
          </linearGradient>
        </defs>
      )}

      {/* The shipped mark is a filled tapered path, not a stroked one, so the
          draw-on runs stroke-dashoffset on a MASK that sweeps the arc's own
          radius and reveals the fill beneath. Same mechanism, right object. */}
      {animated && (
        <defs>
          <mask id={maskId}>
            <circle
              cx="16"
              cy="16"
              r="11"
              fill="none"
              stroke="#fff"
              strokeWidth="9"
              className="cd-mark-draw"
              strokeDasharray={ARC_CIRCUMFERENCE}
              transform="rotate(38 16 16)"
            />
          </mask>
        </defs>
      )}

      <path d={ARC_PATH} fill={arcFill} mask={animated ? `url(#${maskId})` : undefined} />
      <circle
        cx="26.4"
        cy="16"
        r="1.6"
        fill={nodeFill}
        className={cn("cd-mark-node", animated && "cd-mark-node-in")}
      />
    </svg>
  );
}

export interface CoditusLockupProps extends Omit<CoditusMarkProps, "size"> {
  /** Mark height in px. The wordmark and the gap scale from it. */
  markSize?: number;
  orientation?: "horizontal" | "stacked";
}

/**
 * Mark plus wordmark. Gap is 0.42x mark height, per the brand rules — the
 * wordmark is real text, not an outlined path, so it stays selectable, gets the
 * real Satoshi metrics, and costs nothing extra to load.
 */
export function CoditusLockup({
  markSize = 26,
  orientation = "horizontal",
  className,
  title = "Coditu",
  ...markProps
}: CoditusLockupProps) {
  const gap = Math.round(markSize * 0.42);
  return (
    <span
      className={cn(
        "inline-flex items-center",
        orientation === "stacked" && "flex-col",
        className
      )}
      style={{ gap }}
    >
      <CoditusMark size={markSize} title={undefined} {...markProps} />
      <span
        className="font-display font-bold tracking-[-0.02em] whitespace-nowrap"
        style={{ fontSize: Math.round(markSize * 0.92) }}
      >
        {title}
      </span>
    </span>
  );
}
