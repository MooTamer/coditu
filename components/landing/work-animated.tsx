import { WorkGalleryClient } from "@/components/landing/work-gallery.client";
import type { WorkItem } from "@/lib/marketing-content";

interface WorkAnimatedProps {
  items: WorkItem[];
  cardLabel?: string;
}

export function WorkAnimated({ items, cardLabel }: WorkAnimatedProps) {
  return <WorkGalleryClient items={items} cardLabel={cardLabel} />;
}
