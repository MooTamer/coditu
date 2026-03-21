"use client";

import { type AnchorHTMLAttributes, type KeyboardEvent, useCallback } from "react";

import { getScrollBehavior, prefersReducedMotionFromMediaQuery } from "../_lib/motion";

interface AnchorLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: `#${string}`;
  onNavigate?: () => void;
  offsetPx?: number;
}

function parsePixelValue(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value.replace("px", "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getNavbarOffset(defaultOffset: number): number {
  if (typeof window === "undefined") {
    return defaultOffset;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  const cssOffset = parsePixelValue(rootStyles.getPropertyValue("--navbar-height"), defaultOffset);

  const navbar = document.querySelector<HTMLElement>("[data-navbar-root='true']");
  if (!navbar) {
    return cssOffset;
  }

  const measured = navbar.getBoundingClientRect().height;
  return Number.isFinite(measured) && measured > 0 ? measured : cssOffset;
}

function focusTarget(target: HTMLElement) {
  const hadTabIndex = target.hasAttribute("tabindex");

  if (!hadTabIndex) {
    target.setAttribute("tabindex", "-1");
  }

  target.focus({ preventScroll: true });

  if (!hadTabIndex) {
    target.addEventListener(
      "blur",
      () => {
        target.removeAttribute("tabindex");
      },
      { once: true }
    );
  }
}

export function AnchorLink({
  href,
  onClick,
  onKeyDown,
  onNavigate,
  offsetPx = 96,
  ...props
}: AnchorLinkProps) {
  const navigateToHash = useCallback(() => {
    const id = href.replace("#", "").trim();
    if (!id) {
      return false;
    }

    const target = document.getElementById(decodeURIComponent(id));
    if (!target) {
      return false;
    }

    const reducedMotion = prefersReducedMotionFromMediaQuery();
    const navbarOffset = getNavbarOffset(offsetPx);
    const targetTop = Math.max(
      0,
      window.scrollY + target.getBoundingClientRect().top - navbarOffset - 12
    );

    window.scrollTo({
      top: targetTop,
      behavior: getScrollBehavior(reducedMotion),
    });

    window.history.pushState(null, "", `#${id}`);
    focusTarget(target);

    onNavigate?.();
    return true;
  }, [href, offsetPx, onNavigate]);

  const handleClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"] = (event) => {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    ) {
      return;
    }

    const didNavigate = navigateToHash();
    if (didNavigate) {
      event.preventDefault();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      navigateToHash();
    }
  };

  return <a href={href} onClick={handleClick} onKeyDown={handleKeyDown} {...props} />;
}
