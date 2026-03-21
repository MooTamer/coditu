import {
  BrainCircuit,
  Building2,
  Globe,
  Layers,
  LayoutTemplate,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";

import type { IconKey } from "@/lib/marketing-content";

export const iconMap: Record<IconKey, ComponentType<{ className?: string }>> = {
  globe: Globe,
  sparkles: Sparkles,
  layout: LayoutTemplate,
  workflow: Workflow,
  search: Search,
  brain: BrainCircuit,
  building: Building2,
  layers: Layers,
};
