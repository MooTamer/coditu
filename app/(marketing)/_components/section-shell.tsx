import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Container } from "./container";

interface SectionShellProps extends HTMLAttributes<HTMLElement> {
  id?: string;
  as?: "section" | "footer";
  containerClassName?: string;
}

export function SectionShell({
  as = "section",
  id,
  className,
  containerClassName,
  children,
  ...props
}: SectionShellProps) {
  const Component = as;

  return (
    <Component
      id={id}
      className={cn("section-anchor py-16 sm:py-24 focus:outline-none", className)}
      {...props}
    >
      <Container className={containerClassName}>{children}</Container>
    </Component>
  );
}
