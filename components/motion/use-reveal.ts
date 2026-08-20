"use client";

import { useSyncExternalStore } from "react";

import { REDUCED, reveal, type RevealTier, type RevealTierName } from "@/lib/motion";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * The single reduced-motion check in the codebase. Every motion decision reads
 * this hook rather than calling `matchMedia` itself, so the preference is
 * honoured in one place and reacts when the user changes it mid-session.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: `matchMedia` is
 * an external store, and reading it through the store API means the value is
 * correct on the very first client render instead of one cascading re-render
 * later.
 *
 * Note this is only for JavaScript-driven motion. CSS reveals honour
 * `prefers-reduced-motion` through the media query in `app/globals.css` and
 * never consult this hook.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Resolves a motion tier against the user's reduced-motion preference.
 *
 * `useReveal("section")` gives `{ y: 18, blur: 14, duration: 0.52 }` normally,
 * `{ y: 0, blur: 0, duration: 0.12 }` under reduced motion.
 */
export function useReveal(tier: RevealTierName = "section"): RevealTier & { reduced: boolean } {
  const reduced = usePrefersReducedMotion();
  return { ...(reduced ? REDUCED : reveal[tier]), reduced };
}
