import type { Transition, Variants } from "framer-motion";

export type CubicBezier = [number, number, number, number];

export const motionTokens = {
  easing: {
    smooth: [0.22, 1, 0.36, 1] as CubicBezier,
    snappy: [0.16, 1, 0.3, 1] as CubicBezier,
    gentle: [0.32, 0.72, 0, 1] as CubicBezier,
  },
  duration: {
    quick: 0.24,
    normal: 0.42,
    slow: 0.72,
    float: 6,
  },
  reveal: {
    yOffset: 18,
    blur: 10,
    scale: 0.985,
  },
  stagger: {
    tight: 0.06,
    normal: 0.1,
  },
};

export interface RevealOptions {
  delay?: number;
  duration?: number;
  yOffset?: number;
  blur?: number;
  scale?: number;
}

export function cssBezier(ease: CubicBezier): string {
  return `cubic-bezier(${ease.join(",")})`;
}

export function getRevealVariants(
  reducedMotion: boolean,
  options: RevealOptions = {}
): Variants {
  const yOffset = options.yOffset ?? motionTokens.reveal.yOffset;
  const blur = options.blur ?? motionTokens.reveal.blur;
  const scale = options.scale ?? motionTokens.reveal.scale;

  if (reducedMotion) {
    return {
      hidden: { opacity: 1, y: 0, filter: "blur(0px)", scale: 1 },
      visible: { opacity: 1, y: 0, filter: "blur(0px)", scale: 1 },
    };
  }

  return {
    hidden: {
      opacity: 0,
      y: yOffset,
      filter: `blur(${blur}px)`,
      scale,
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
    },
  };
}

export function getRevealTransition(
  reducedMotion: boolean,
  options: RevealOptions = {}
): Transition {
  if (reducedMotion) {
    return { duration: 0 };
  }

  return {
    duration: options.duration ?? motionTokens.duration.normal,
    delay: options.delay ?? 0,
    ease: motionTokens.easing.smooth,
  };
}

export function getFloatTransition(
  reducedMotion: boolean,
  delay = 0,
  duration = motionTokens.duration.float
): Transition {
  if (reducedMotion) {
    return { duration: 0 };
  }

  return {
    duration,
    delay,
    repeat: Number.POSITIVE_INFINITY,
    repeatType: "loop",
    ease: motionTokens.easing.gentle,
  };
}

export function prefersReducedMotionFromMediaQuery(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
