"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

import { motionTokens, prefersReducedMotionFromMediaQuery, cssBezier } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface RevealAnimatedProps extends HTMLAttributes<HTMLDivElement> {
  delayMs?: number;
  durationMs?: number;
  blurPx?: number;
  yOffset?: number;
  once?: boolean;
}

export function RevealAnimated({
  children,
  className,
  delayMs = 0,
  durationMs = motionTokens.duration.normal * 1000,
  blurPx = motionTokens.reveal.blur,
  yOffset = motionTokens.reveal.yOffset,
  once = true,
  ...props
}: RevealAnimatedProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotionFromMediaQuery());

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      const nextValue = media.matches;
      setReducedMotion(nextValue);

      if (nextValue) {
        setIsVisible(true);
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setIsVisible(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }

        if (entry.isIntersecting) {
          setIsVisible(true);

          if (once) {
            observer.unobserve(entry.target);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold: 0.2,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [once, reducedMotion]);

  const style: CSSProperties = reducedMotion
    ? { opacity: 1, transform: "none", filter: "none" }
    : {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translate3d(0, 0, 0)" : `translate3d(0, ${yOffset}px, 0)`,
        filter: isVisible ? "blur(0px)" : `blur(${blurPx}px)`,
        transitionProperty: "opacity, transform, filter",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: cssBezier(motionTokens.easing.smooth),
        transitionDelay: `${isVisible ? delayMs : 0}ms`,
        willChange: "opacity, transform, filter",
      };

  return (
    <div ref={ref} className={cn(className)} style={style} {...props}>
      {children}
    </div>
  );
}
